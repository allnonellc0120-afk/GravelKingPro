import assert from "node:assert/strict";
import { parseArtistProfilePatch } from "../routes/userProfile";
import {
  generationEntitlementCandidate,
  shouldIssueCertificate,
} from "../services/mlkOrchestrator";

assert.deepEqual(parseArtistProfilePatch({ artist_name: "  River Stone  " }), {
  artistName: "River Stone",
});
assert.deepEqual(parseArtistProfilePatch({ hometown: "  Austin  ", bio: "  " }), {
  hometown: "Austin",
  bio: "  ",
});
assert.equal(parseArtistProfilePatch({ artistName: "legacy camelCase" }), null);
assert.equal(parseArtistProfilePatch({ artist_name: "River", extra: "unexpected" }), null);
assert.equal(parseArtistProfilePatch({ bio: 42 }), null);
assert.equal(parseArtistProfilePatch({ artist_name: "x".repeat(121) }), null);
assert.equal(parseArtistProfilePatch({}), null);
assert.equal(parseArtistProfilePatch({ toString: "unexpected" }), null);

assert.equal(generationEntitlementCandidate("mlk-gen-cert-123"), "cert-123");
assert.equal(generationEntitlementCandidate("mlk-gen-"), null);
assert.equal(generationEntitlementCandidate("stripe-session"), null);

const certificateConditions = {
  requested: true,
  fingerprintStatus: "no_match" as const,
  signingSecretAvailable: true,
};
assert.equal(shouldIssueCertificate({ ...certificateConditions }), true);
assert.equal(
  shouldIssueCertificate({ ...certificateConditions, requested: false }),
  false,
);
assert.equal(
  shouldIssueCertificate({ ...certificateConditions, fingerprintStatus: "unavailable" }),
  false,
);
assert.equal(
  shouldIssueCertificate({ ...certificateConditions, signingSecretAvailable: false }),
  false,
);
assert.equal(
  shouldIssueCertificate({ ...certificateConditions, parentCertId: null }),
  false,
);
assert.equal(
  shouldIssueCertificate({ ...certificateConditions, parentCertId: "real-parent-cert" }),
  true,
);

console.log("Profile/remix contract tests passed.");