// The Route 53 zone the domain registration created (see cdk.json). Referenced
// by id rather than looked up, so deploys never need the lookup role.
export interface Zone {
  hostedZoneId: string;
  zoneName: string;
}
