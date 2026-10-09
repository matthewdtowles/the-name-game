#!/usr/bin/env bash
# One-time AWS setup for The Name Game, run with an admin profile. It keeps this
# app's deploys away from everything else in the account:
#
#   exec-policy     tng-cfn-exec: what CloudFormation may do for this app's stacks
#   service-roles   AWS-managed roles the stacks need but may not create
#                   themselves (API Gateway custom domains)
#   bootstrap       CDK bootstrap with qualifier "tng" (CDKToolkit-tng) using that policy
#   permission-set  TheNameGameDeployer in IAM Identity Center + the local
#                   "the-name-game" profile; it can only assume the tng deploy and
#                   publishing roles (not the lookup role, which can read the
#                   whole account)
#   github-role     tng-github-deploy: CI on main of this repo, same limits
#   budget          $5/month on the project=the-name-game cost tag
#
# Every step is idempotent. Run one with `./setup.sh <step>`, or `./setup.sh all`.
# Policy files say ACCOUNT_ID; the account comes from the active profile.
set -euo pipefail
cd "$(dirname "$0")"

export AWS_PROFILE="${AWS_PROFILE:-portfolio}" AWS_PAGER=""
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
PROJECT_TAG=Key=project,Value=the-name-game
RENDERED=$(mktemp -d)
trap 'rm -rf "$RENDERED"' EXIT

render() {
  sed "s/ACCOUNT_ID/$ACCOUNT/g" "$1" > "$RENDERED/$1"
  echo "file://$RENDERED/$1"
}

exec_policy() {
  local arn="arn:aws:iam::$ACCOUNT:policy/tng-cfn-exec"
  if aws iam get-policy --policy-arn "$arn" >/dev/null 2>&1; then
    # IAM keeps at most five versions; drop the oldest non-default one first.
    local versions
    versions=$(aws iam list-policy-versions --policy-arn "$arn" \
      --query 'Versions[?!IsDefaultVersion].VersionId' --output text)
    if [ "$(wc -w <<< "$versions")" -ge 4 ]; then
      aws iam delete-policy-version --policy-arn "$arn" --version-id "$(tr '\t' '\n' <<< "$versions" | tail -1)"
    fi
    aws iam create-policy-version --policy-arn "$arn" \
      --policy-document "$(render cfn-exec-policy.json)" --set-as-default >/dev/null
    echo "Updated $arn"
  else
    aws iam create-policy --policy-name tng-cfn-exec \
      --description "What CloudFormation may do when deploying The Name Game" \
      --policy-document "$(render cfn-exec-policy.json)" --tags "$PROJECT_TAG" >/dev/null
    echo "Created $arn"
  fi
}

service_roles() {
  if aws iam get-role --role-name AWSServiceRoleForAPIGateway >/dev/null 2>&1; then
    echo "AWSServiceRoleForAPIGateway exists"
  else
    aws iam create-service-linked-role --aws-service-name ops.apigateway.amazonaws.com >/dev/null
    echo "Created AWSServiceRoleForAPIGateway"
  fi
}

bootstrap() {
  npx --yes aws-cdk@2 bootstrap "aws://$ACCOUNT/$REGION" \
    --qualifier tng \
    --toolkit-stack-name CDKToolkit-tng \
    --cloudformation-execution-policies "arn:aws:iam::$ACCOUNT:policy/tng-cfn-exec" \
    --tags project=the-name-game
  # The bootstrap's deploy role may change any stack in the account. Pin it to
  # this app's stacks so it can never touch anything else deployed with CDK.
  aws iam put-role-policy --role-name "cdk-tng-deploy-role-$ACCOUNT-$REGION" \
    --policy-name tng-stacks-only --policy-document "$(render deploy-role-guard.json)"
  echo "Pinned cdk-tng-deploy-role to TheNameGame* stacks"
}

permission_set() {
  local instance store user_id ps_arn
  instance=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
  store=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
  user_id=$(aws identitystore get-user-id --identity-store-id "$store" \
    --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"userName\",\"AttributeValue\":\"${SSO_USER:-matthew}\"}}" \
    --query UserId --output text)

  for arn in $(aws sso-admin list-permission-sets --instance-arn "$instance" --query 'PermissionSets[]' --output text); do
    if [ "$(aws sso-admin describe-permission-set --instance-arn "$instance" --permission-set-arn "$arn" \
      --query PermissionSet.Name --output text)" = TheNameGameDeployer ]; then
      ps_arn=$arn
    fi
  done
  if [ -z "${ps_arn:-}" ]; then
    ps_arn=$(aws sso-admin create-permission-set --instance-arn "$instance" \
      --name TheNameGameDeployer --session-duration PT8H \
      --description "Deploys The Name Game through its CDK roles, and nothing else" \
      --tags "$PROJECT_TAG" --query PermissionSet.PermissionSetArn --output text)
    echo "Created permission set $ps_arn"
  fi
  aws sso-admin put-inline-policy-to-permission-set --instance-arn "$instance" \
    --permission-set-arn "$ps_arn" --inline-policy "$(sed "s/ACCOUNT_ID/$ACCOUNT/g" deployer-policy.json)"

  if ! aws sso-admin list-account-assignments --instance-arn "$instance" --account-id "$ACCOUNT" \
    --permission-set-arn "$ps_arn" --query 'AccountAssignments[].PrincipalId' --output text | grep -q "$user_id"; then
    aws sso-admin create-account-assignment --instance-arn "$instance" --target-id "$ACCOUNT" \
      --target-type AWS_ACCOUNT --permission-set-arn "$ps_arn" \
      --principal-type USER --principal-id "$user_id" >/dev/null
    echo "Assigned TheNameGameDeployer to ${SSO_USER:-matthew}"
  fi
  # Push the (possibly updated) inline policy to the account.
  aws sso-admin provision-permission-set --instance-arn "$instance" --permission-set-arn "$ps_arn" \
    --target-type AWS_ACCOUNT --target-id "$ACCOUNT" >/dev/null

  local session
  session=$(aws configure get sso_session)
  aws configure set sso_session "$session" --profile the-name-game
  aws configure set sso_account_id "$ACCOUNT" --profile the-name-game
  aws configure set sso_role_name TheNameGameDeployer --profile the-name-game
  aws configure set region "$REGION" --profile the-name-game
  echo "Profile the-name-game is ready: aws sso login --profile the-name-game"
}

github_role() {
  if aws iam get-role --role-name tng-github-deploy >/dev/null 2>&1; then
    aws iam update-assume-role-policy --role-name tng-github-deploy \
      --policy-document "$(render github-trust-policy.json)"
  else
    aws iam create-role --role-name tng-github-deploy \
      --description "GitHub Actions on main of the-name-game; deploys through the tng CDK roles" \
      --assume-role-policy-document "$(render github-trust-policy.json)" --tags "$PROJECT_TAG" >/dev/null
    echo "Created role tng-github-deploy"
  fi
  aws iam put-role-policy --role-name tng-github-deploy --policy-name deploy \
    --policy-document "$(render github-deploy-policy.json)"
}

budget() {
  : "${BUDGET_EMAIL:?Set BUDGET_EMAIL to the address that gets budget alerts}"
  local subscriber="SubscriptionType=EMAIL,Address=$BUDGET_EMAIL"
  if aws budgets describe-budget --account-id "$ACCOUNT" --budget-name the-name-game >/dev/null 2>&1; then
    aws budgets update-budget --account-id "$ACCOUNT" --new-budget "$(cat budget.json)"
    echo "Updated budget the-name-game"
  else
    aws budgets create-budget --account-id "$ACCOUNT" --budget "$(cat budget.json)" \
      --notifications-with-subscribers \
      "Notification={NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=80,ThresholdType=PERCENTAGE},Subscribers=[{$subscriber}]" \
      "Notification={NotificationType=FORECASTED,ComparisonOperator=GREATER_THAN,Threshold=100,ThresholdType=PERCENTAGE},Subscribers=[{$subscriber}]"
    echo "Created budget the-name-game"
  fi
  # A cost tag can only be activated once AWS has seen it on a resource, which
  # can take up to a day after the first tagged resource exists.
  if aws ce update-cost-allocation-tags-status \
    --cost-allocation-tags-status TagKey=project,Status=Active >/dev/null 2>&1; then
    echo "Cost allocation tag 'project' is active"
  else
    echo "Cost tag 'project' isn't visible to billing yet; rerun './setup.sh budget' tomorrow"
  fi
}

case "${1:-}" in
  exec-policy) exec_policy ;;
  service-roles) service_roles ;;
  bootstrap) bootstrap ;;
  permission-set) permission_set ;;
  github-role) github_role ;;
  budget) budget ;;
  all) exec_policy; service_roles; bootstrap; permission_set; github_role; budget ;;
  *) echo "Usage: $0 exec-policy|service-roles|bootstrap|permission-set|github-role|budget|all" >&2; exit 64 ;;
esac
