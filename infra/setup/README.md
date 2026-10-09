# AWS setup

One-time setup that gives The Name Game its own deploy path inside the shared
AWS account, apart from i-want-my-mtg and everything else there. `setup.sh` does
all of it, idempotently, using an admin profile (`portfolio` by default).

| Step | What it creates |
|---|---|
| `exec-policy` | `tng-cfn-exec`: all CloudFormation may do for this app's stacks. S3, DynamoDB, Lambda and logs are limited to `thenamegame*` / `TheNameGame*` names, and IAM to `TheNameGame*` roles. |
| `service-roles` | AWS-managed service-linked roles the stacks need but can't create themselves: `AWSServiceRoleForAPIGateway`, for the game server's custom domain. |
| `bootstrap` | CDK bootstrap with qualifier `tng` (stack `CDKToolkit-tng`, roles `cdk-tng-*`), using that policy. It then pins `cdk-tng-deploy-role` to `TheNameGame*` stacks (`deploy-role-guard.json`); CDK's default lets it change any stack in the account. |
| `permission-set` | `TheNameGameDeployer` in IAM Identity Center, assigned to you, plus the local `the-name-game` profile. It can assume the tng deploy and publishing roles, read this app's stacks and logs, and publish the web app to `thenamegame*` buckets and refresh their CloudFront cache, nothing else. It deliberately can't assume `cdk-tng-lookup-role`, which has account-wide ReadOnlyAccess. |
| `github-role` | `tng-github-deploy`: GitHub Actions on `main` of this repo, through the existing GitHub OIDC provider, with the same limits. It trusts both of GitHub's subject formats; this repo uses the immutable one with numeric ids. |
| `budget` | A $5/month budget on the `project=the-name-game` cost tag, emailing `BUDGET_EMAIL` at 80% actual and 100% forecast. It also activates the `project` cost tag, which billing only allows once it has seen the tag on a resource (up to a day after the first deploy). |

```bash
./setup.sh all                     # or one step: ./setup.sh bootstrap
BUDGET_EMAIL=you@example.com ./setup.sh budget
aws sso login --profile the-name-game
```

Policy files say `ACCOUNT_ID`; the script substitutes the active account, so
the account number stays out of this public repo. CDK stacks for this app must
be named `TheNameGame*` and synthesize with the `tng` qualifier.
