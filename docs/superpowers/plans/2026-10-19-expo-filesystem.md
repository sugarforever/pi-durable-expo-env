# Expo filesystem implementation plan

Goal: a standalone MIT package for Pi Durable 1.3 and Expo 58. The package implements a private workspace filesystem for Pi read/write/edit tools without a Node runtime or shell.

Architecture: portable filesystem core with an injected, bounded backend; an Expo adapter maps virtual /workspace paths into an app-private directory. Snapshot readers preserve file identity across rename. File mutations share a queue within the JavaScript realm.

Limits: 8 MiB per file and 32 MiB of open snapshots by default. No symlink/realpath, fsync, watch or shell claims. This is a trusted private workspace, not a sandbox against hostile native writers. Cancellation cannot roll back native operations already committed.

- [x] Write failing behavior tests for containment, bounded I/O, readers, mutations, cancellation and unsupported capabilities.
- [x] Implement portable core and Expo backend.
- [x] Exercise genuine Pi tools and selected unmodified upstream reader conformance cases.
- [x] Verify types, portable dependency graph and npm tarball consumption.
- [x] Add a minimal independent Expo example; export Android/iOS resources and verify iOS native behavior when available.
- [x] Review independently; finish documentation, license and local Git history. Do not publish or set a remote before the user supplies it.
