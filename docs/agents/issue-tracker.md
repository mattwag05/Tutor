# Project bindings

Tutor uses Forgejo issues for its existing label-driven coding workflow. Do not create a second GitHub tracker. The canonical repository is `matthewwagner/Tutor` on Forgejo, default branch `main`. Verify `origin` before publication.

The `agent:*` labels control the existing opt-in coding automation. Approval is bound to its recorded plan. Triage labels classify work and never substitute for approval. PR merge requires separate user approval.

Run the import checks and smoke-test subset defined in `.forgejo/workflows/tests.yml`. Keep its Python 3.11, 3.12, and 3.13 matrix as the native acceptance source. The background driver additionally requires a successful local smoke run before publication; a missing environment or failed check is a blocked run, not a pass.

Maintain relevant existing documentation under `docs/` and preserve recorded specifications until their decisions and deferred work are reconciled. Apply unslop and session-closeout. Do not recreate the retired DeepTutor homelab service as part of coding work.
