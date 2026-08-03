import { GoogleAuth } from "google-auth-library";
import { readFileSync } from 'node:fs';
const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? '{}');
const auth = new GoogleAuth({ credentials: { client_email: creds.client_email, private_key: creds.private_key }, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
const client = await auth.getClient();
const { token } = await client.getAccessToken();
const csv = readFileSync('/tmp/gravelking-data-safety.csv','utf8');
const res = await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.gravelkingpro.app/dataSafety', {
 method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:JSON.stringify({safetyLabels:csv})
});
console.log('status:',res.status); console.log((await res.text()).slice(0,5000));
process.exit(res.ok ? 0 : 1);
