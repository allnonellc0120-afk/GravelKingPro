---
name: Artifact runtime system dependencies
description: API artifact deployments need system binaries declared in the root Replit Nix configuration, not only in an unused Dockerfile.
---

The API artifact's production runtime is built from its artifact configuration and root environment, so binaries such as FFmpeg must be declared in the root Nix package list. A Dockerfile under the artifact directory does not guarantee that the managed artifact deployment includes those binaries.

**Why:** Production mastering returned `spawn ffmpeg ENOENT` even though the repository Dockerfile installed FFmpeg; the managed artifact deployment was not using that Dockerfile.

**How to apply:** When an artifact API invokes an OS binary, add its Nix package to the root `.replit` configuration and verify the command exists in the deployed runtime after publishing.