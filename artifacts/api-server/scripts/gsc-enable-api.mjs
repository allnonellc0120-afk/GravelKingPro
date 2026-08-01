// Enable the Search Console API in the SA's GCP project, then exit.
import { GoogleAuth } from "google-auth-library";

const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT ?? "{}");
const project = creds.project_id;
console.log("Project:", project);

const auth = new GoogleAuth({
  credentials: { client_email: creds.client_email, private_key: creds.private_key },
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

const resp = await fetch(
  `https://serviceusage.googleapis.com/v1/projects/${project}/services/searchconsole.googleapis.com:enable`,
  { method: "POST", headers: { Authorization: `Bearer ${token}` } }
);
const body = await resp.json().catch(() => null);
console.log("enable:", resp.status, JSON.stringify(body)?.slice(0, 300));
