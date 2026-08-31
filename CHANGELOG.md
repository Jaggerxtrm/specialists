# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Active-tool advisory startup context (unitAI-kaae7) ([c250936](https://github.com/xtrm-dev/specialists/commit/c250936e2e47d481ff9f7cc146df06c6ffa4a571))
- Global mandatory-rules template_sets selection (unitAI-klo6k) ([84a261c](https://github.com/xtrm-dev/specialists/commit/84a261c987d0d85596e349e197b3ffc3906ee38c))

### Fixed
- Repair bun observability baseline gate ([441558c](https://github.com/xtrm-dev/specialists/commit/441558ca021af24fc6385a7694c24a7a902b13ea))
- Prevent forensic event seq overwrite ([91f2186](https://github.com/xtrm-dev/specialists/commit/91f2186dd708107bb9bb2d34554232dc347a04ef))
- Expose enabled-extension tools via deny-list tool gate (unitAI-34pyf) ([6129ebb](https://github.com/xtrm-dev/specialists/commit/6129ebb1453991e9d5f5f30ac9468fc1f70dcdc7))
- Fail-closed extension tool-policy gate (unitAI-34pyf security rework) ([b286e2c](https://github.com/xtrm-dev/specialists/commit/b286e2c87bb2325103a019cd155e2c985e42cf87))
- Hard-fail policy gate, dead dist removal, raw-spawn assertion (unitAI-34pyf audit round 2) ([d444d6d](https://github.com/xtrm-dev/specialists/commit/d444d6d64c7037219d2e40825644d6ffbadaa5f8))
- Never emit unresolved template placeholders ([333df3e](https://github.com/xtrm-dev/specialists/commit/333df3e58fc21c9f0e4620aed84400ac7da7e83b))
- Reject pending RPC immediately when pi child exits (unitAI-u5xjk) ([2ffea6d](https://github.com/xtrm-dev/specialists/commit/2ffea6dbde3d1fb8893bc981e6684073fe13fe97))

### Other changes
- Support dynamic execution extension sources ([479d2b6](https://github.com/xtrm-dev/specialists/commit/479d2b69bce86b28c9556d21ecc00d27d10f2a74))
- Remove retired loose service-skills injections ([d7ebe5b](https://github.com/xtrm-dev/specialists/commit/d7ebe5bea5431071dc25ebec3bd81992f0bf3802))
- Put exact bead id in every turn-1 initial prompt (unitAI-edfjs) ([cca1f3e](https://github.com/xtrm-dev/specialists/commit/cca1f3e1adb32f63c2189bbcaffb8bd4bd944a0c))

### Project maintenance
- Reconcile Specialists canon with native XTRM runtime (#270) ([e200b17](https://github.com/xtrm-dev/specialists/commit/e200b175523aa4c755a1c270350038e2b163c105))
- Consolidate current Specialists programme canon (#271) ([79dbecc](https://github.com/xtrm-dev/specialists/commit/79dbecc82789e8cbc02b733c50cd4c7d867043e1))
- Finish extension integration coverage ([47ae461](https://github.com/xtrm-dev/specialists/commit/47ae461859901f4d16df374ba727341ec48f4b66))
- Rebuild 3.21.6 RC artifacts ([af65334](https://github.com/xtrm-dev/specialists/commit/af65334ba4dc55bb5731a95fce08fc314f9c1274))
- Rebuild 3.21.6 artifacts after final extension fixes (unitAI-1d6ui) ([d39e17e](https://github.com/xtrm-dev/specialists/commit/d39e17eb0c0d09fa73c25de1c77b85f667b8a010))
- Rebuild 3.21.6 artifacts after RPC fail-fast fix (unitAI-wuing) ([aa7975e](https://github.com/xtrm-dev/specialists/commit/aa7975e4d69e4453ccabb915acaa748fb1631275))

## [3.21.5] - 2026-08-20

Patch focused on observability truthfulness and Pi vendored-tooling parity. `sp log` default output now filters agent-internal events (turn/tool/model.token_usage) that were drowning the 2-3 real lifecycle rows per job; the corresponding monitor recipes in `using-specialists/references/monitoring.md` are corrected to read from `.forensic_event` and to distinguish terminal (`job.completed|failed|cancelled`) from attention (waiting, `process_health.stale_detected`, `error.*`) states — the prior recipe silently matched nothing and coordinators read the silence as "still running". Background specialist dispatch now surfaces launch errors instead of returning a misleading `ok` envelope. Two Pi extension vendored-fork fixes bring `read-line-numbers` behavior in line with the Core implementation (EOF model + real-blank-line handling).

### Fixed
- Mirror Core read-line-numbers blank-line fix in vendored fork (unitAI-nx80v) (#265) ([d2785cf](https://github.com/xtrm-dev/specialists/commit/d2785cfaa6b9cfcd5251bfbcc34bb5cfee0edca0))
- Correct vendored read-line-numbers fork to Pi EOF model (unitAI-gajax) (#266) ([3760cf4](https://github.com/xtrm-dev/specialists/commit/3760cf429934f79739b628a967e78d495dbfd96d))
- Surface launch errors in the background envelope (xtrm-5kwk2) (#267) ([daba619](https://github.com/xtrm-dev/specialists/commit/daba6198ba5d1f8fcc5f5314e21ca2d5860a1c42))
- Sp log default forensic path emits every agent-internal event (unitAI-mkkjk) (#268) ([7a13d63](https://github.com/xtrm-dev/specialists/commit/7a13d638e92a7b3e3a9ef019eea75deedb150597))

### Project maintenance
- V3.21.4 release-path followups (unitAI-ip5jz) ([588593d](https://github.com/xtrm-dev/specialists/commit/588593d2380d5ff556cb6046d9d1b8f4434cba67))
- Stop the boundary-rule test depending on bd + a real bead ([1ce1006](https://github.com/xtrm-dev/specialists/commit/1ce1006f7d82283c306a046dc2acea4c9742e70b))
- Sp log --json envelope shape + correct monitor recipes (unitAI-nhl6x) (#269) ([bcdbd30](https://github.com/xtrm-dev/specialists/commit/bcdbd30cb8248155c0e57dd9243f6d32c612bab9))

## [3.21.4] - 2026-08-14

### Fixed
- Sp config show --resolved falls back to canonical catalog ([6366058](https://github.com/xtrm-dev/specialists/commit/636605877881de38cc724d9df7c86b2330915eda))
- Classify rate-limit / quota errors as transient (unitAI-63xi3.1) ([8c1c797](https://github.com/xtrm-dev/specialists/commit/8c1c797e385f38e795a102336633d7558cff1945))
- Harden --bead lookup against shell injection (unitAI-eao44, CWE-78) ([1add04a](https://github.com/xtrm-dev/specialists/commit/1add04af28b853ee8d950f267dc74bf8bbb90def))

### Project maintenance
- Regenerate v3.21.3 section via git-cliff (was incomplete) ([8155e0d](https://github.com/xtrm-dev/specialists/commit/8155e0ddbb8a8e6150e20fdbe99c5dd4ebefb461))
- Drop CHANGELOG-content assertion after v3.21.3 regeneration ([462c090](https://github.com/xtrm-dev/specialists/commit/462c090c03e3940c79048af8b4c7c0e26b4c541e))

## [3.21.3] - 2026-08-14

### Added
- Add native codex role/render surface (K3, experimental) ([6c3ffe4](https://github.com/xtrm-dev/specialists/commit/6c3ffe498b1264da0763e462309e2d8332b8e73f))
- Complete codex role invocation and result parity (K4) ([8641d36](https://github.com/xtrm-dev/specialists/commit/8641d36af64765bde73751171317bae0cc9bf786))
- Retire active Serena runtime integration (K4, unitAI-e67up.8) ([7053236](https://github.com/xtrm-dev/specialists/commit/7053236fcac9b5d244fd8edf9c9a08979c2491fe))
- Add bounded semantic review gates ([92225bb](https://github.com/xtrm-dev/specialists/commit/92225bb50903a66ffdd36c6fee423247b40621f8))
- Add contextual exploitability method ([772041e](https://github.com/xtrm-dev/specialists/commit/772041e46d669d58395e0c56c2b1237e20b637ba))
- Add semantic correctness gates ([a79c072](https://github.com/xtrm-dev/specialists/commit/a79c0729d87ad1d6d758e86d7b649a678647209f))
- Establish verified citation contract ([b3f4fff](https://github.com/xtrm-dev/specialists/commit/b3f4fff3e628522f684aff3dac3884f124e4f9ab))
- Consume read-line-numbers extension via pi -e alongside --no-extensions ([9da21eb](https://github.com/xtrm-dev/specialists/commit/9da21eb2a46f17732680002e098b76fa934600ee))

### Fixed
- Ship CHANGELOG.md in the package, compact the changelog format (#242) ([eaf044f](https://github.com/xtrm-dev/specialists/commit/eaf044f0592aa89d68ba752ec95a36b6404023ae))
- Enforce Core schema patterns in the launch-outcome consumer (K4 review) ([ba3e8dc](https://github.com/xtrm-dev/specialists/commit/ba3e8dcda63c6b5ce3de351fbec3917832f02f41))
- Enforce required-property presence in the launch-outcome consumer (K4 review r3) ([c026f40](https://github.com/xtrm-dev/specialists/commit/c026f40357382c6c22742ee27420f1e70c3c6299))
- Preserve native read fallback ([5ed558a](https://github.com/xtrm-dev/specialists/commit/5ed558aa38069ff0f4a987e29e96a715544b9d24))
- Pin injected diff evidence to immutable head ([5b79d47](https://github.com/xtrm-dev/specialists/commit/5b79d47f56330ee0423b9bcd262ac8a9585e5964))
- Reuse resolved tool contract ([25d4a70](https://github.com/xtrm-dev/specialists/commit/25d4a702107e2760dc56f561c9e17700dcc2ae0f))
- Use resolved gitnexus contract ([823aa51](https://github.com/xtrm-dev/specialists/commit/823aa51f125290a8e5204abc3bbdb418826c508e))
- Enforce mandatory rule budget floor ([61b5019](https://github.com/xtrm-dev/specialists/commit/61b50191eb985823ab64450963098ce87f2ee8c0))
- Constrain citation paths to trusted roots ([0880e4e](https://github.com/xtrm-dev/specialists/commit/0880e4e12728a86b9a6e17f986c6750ecf2afdfc))
- Fix package attestation payload gate ([6779738](https://github.com/xtrm-dev/specialists/commit/677973842140d2d1ae36b2a7ee37582757dd172a))
- Enforce release attestation provenance in CI ([0cd941e](https://github.com/xtrm-dev/specialists/commit/0cd941e964a3ff6f9632861f5ae42ad7a3f1f1d8))
- Fix package payload attestation parity ([23386dc](https://github.com/xtrm-dev/specialists/commit/23386dc91d016e6ca3e65f7faad658379db964a6))
- Pin SEC-001 workflow dependencies ([1df5c76](https://github.com/xtrm-dev/specialists/commit/1df5c76c824baf8cb03023a54b956eef6c462fe5))
- Fix CI release boundary failures ([da6a94b](https://github.com/xtrm-dev/specialists/commit/da6a94b4004c72fc0089847f8f13341baa2a6a5e))

### Other changes
- Restore native read tool fallbacks ([3ef4168](https://github.com/xtrm-dev/specialists/commit/3ef41683c1e60ad511f98dfec359f65a6f1e325d))
- Remove Pi session missing-contract GitNexus fallback ([bd86f66](https://github.com/xtrm-dev/specialists/commit/bd86f6604dcefd0d4a6c816a3708012b0b9bece7))
- Fix obligations literal false positives ([57c572f](https://github.com/xtrm-dev/specialists/commit/57c572fe06e606b8aecc908ee3022a66022f70dc))
- Restore GitNexus counts in docs ([efe26e2](https://github.com/xtrm-dev/specialists/commit/efe26e2aa8ad833ff3da9995ee332d225c13e26f))
- Harden unstaged obligations snapshot reads ([8dd9b9f](https://github.com/xtrm-dev/specialists/commit/8dd9b9f3a6dbb034ed08898d08288aa5ff1830f1))
- Restore final .4 release attestation gates ([eb61776](https://github.com/xtrm-dev/specialists/commit/eb61776f1fdee160b8b1b9e2c1efca217f3c4459))
- Pin package artifact upload ([949ff47](https://github.com/xtrm-dev/specialists/commit/949ff471081d158eb83a4f51de4e34a4b49e6b4f))
- Pin package payload workflow actions ([14a592f](https://github.com/xtrm-dev/specialists/commit/14a592ff8a990a6c0157ee0d6c933c99ace61182))

### Project maintenance
- Reconcile roadmap pickup with the released XTRM trio (#244) ([fce9e4d](https://github.com/xtrm-dev/specialists/commit/fce9e4db8616f43fe74a0fec962265c0b39bde9c))
- Characterize K1 Codex surface boundary ([c6eb842](https://github.com/xtrm-dev/specialists/commit/c6eb842bd3f01389419a39532331908dffde502a))
- Pin K1 external references ([f2cbbd3](https://github.com/xtrm-dev/specialists/commit/f2cbbd338959987a7b9da06152ed08bd86f5aceb))
- Clarify K1 Codex fixture provenance ([ba5d803](https://github.com/xtrm-dev/specialists/commit/ba5d8036346bb439c52e598dc37a1cd2c2be1fa2))
- Label K1 fixture evidence owners ([0d1d944](https://github.com/xtrm-dev/specialists/commit/0d1d944d11dc059691febb68e7298a1b23580938))
- Make K1 render evidence reproducible ([502d0be](https://github.com/xtrm-dev/specialists/commit/502d0be25b183a9cafdfb4cf2268aa668e7d0927))
- Pin K1 render error output ([779d608](https://github.com/xtrm-dev/specialists/commit/779d60826487b7710c970bf76e6ca0d43dbe48ce))
- Correct GATE-IFACE ordering for the codex surface (review round 2) ([eb74640](https://github.com/xtrm-dev/specialists/commit/eb74640e3e30cff9a48268a6a02e4f82daa08394))
- Pin prompt hardening contracts ([ca30387](https://github.com/xtrm-dev/specialists/commit/ca30387a1b6e74aa18673a3974877119fc23784b))
- Add silent refusal regression fixture ([704dd3b](https://github.com/xtrm-dev/specialists/commit/704dd3b507479e95d7353c9c4f7182a1b48724fa))
- Add green-chain refusal context fixture ([8485662](https://github.com/xtrm-dev/specialists/commit/8485662e2f6852a5026db75feb1950c35dc12333))
- Model silent refusal acceptance case ([4fa71cd](https://github.com/xtrm-dev/specialists/commit/4fa71cd0c1793f031362214f01de0bbb047eccb0))
- Record Pi v0.84.1 compatibility audit (#251) ([64f5ab3](https://github.com/xtrm-dev/specialists/commit/64f5ab3c5c745d0f04ef12f8a3d7169d99a4119a))
- Chore add to next pr ([81c626a](https://github.com/xtrm-dev/specialists/commit/81c626a0e078aed3b62d9096eade275ac48b5275))
- Checkpoint script-runner contract coverage ([cecc60c](https://github.com/xtrm-dev/specialists/commit/cecc60cb3873dffb2a321200d2ca6d173713537e))
- Fix stale script-runner quarantine expectations ([757277e](https://github.com/xtrm-dev/specialists/commit/757277e7c0c9d96f4c3c297a8aba7dc8a1e07e25))
- Cover safe snapshot reader branches ([11299c7](https://github.com/xtrm-dev/specialists/commit/11299c7ec5509dd9a47e5b7d88dd92e7374bad0a))
- Cover release attestation refusal paths ([a75c5e8](https://github.com/xtrm-dev/specialists/commit/a75c5e89747bbc862d385c4aee20931add39e24e))
- Expect immutable attestation upload action ([4b0fcf0](https://github.com/xtrm-dev/specialists/commit/4b0fcf07bf94b39e0c09aac0f0c0b6ca21e7c29f))
- Cover v3.21.3 release candidate metadata ([c7c1827](https://github.com/xtrm-dev/specialists/commit/c7c182710c65e640ed137d8065e687a4ff243e3b))
- Anchor release attestation to tagged source ([2619316](https://github.com/xtrm-dev/specialists/commit/2619316d2640a936f4a9ca34432de6cadce5d86e))
- Commit reconciled beads export and ignore runtime skill links ([4a6921f](https://github.com/xtrm-dev/specialists/commit/4a6921fe0f1bd28cf34ecf3204562d66051c425a))
- Mark 5 operator-only skills as non-model-invocable (#253) ([8331659](https://github.com/xtrm-dev/specialists/commit/8331659438d88e01ab5d08c9d2416e662bc19d8a))

## [v3.21.2] — 2026-07-28

### Added

- **Notify parent on terminal jobs** ([0873ac2](https://github.com/xtrm-dev/specialists/commit/0873ac214163b9fb9c7be88c424393eacfbafad7))

- **Advance terminal bead assignee** ([f718df6](https://github.com/xtrm-dev/specialists/commit/f718df6839d0f5c6d700b7c5ab6fe01da62e01b9))

### Fixed

- **Resolve docs review gate findings** ([ec64645](https://github.com/xtrm-dev/specialists/commit/ec64645053f1cfe5f097275d40a8fe8bd84ee49a))

- **Align CLI honesty and coordinator prompt** ([4253782](https://github.com/xtrm-dev/specialists/commit/4253782779e87e6e67eb39c8b7509808d17b8f69))

- **Preserve terminal notification contract** ([54bf9f7](https://github.com/xtrm-dev/specialists/commit/54bf9f760bda247909b10358e85a92e57adedf28))

- **Retain active sibling assignee** ([f30d10b](https://github.com/xtrm-dev/specialists/commit/f30d10b94c76decbdc4b0c967d40d0fe9413b122))

- **Bound the attach integration pty and un-quarantine it (#226)** ([c3eca68](https://github.com/xtrm-dev/specialists/commit/c3eca6828b4d2eba1d575264e67e1d9c309c14e9))

- **Restore monitoring doctrine lost in DOC-01 (#227)** ([0501e02](https://github.com/xtrm-dev/specialists/commit/0501e02c9ff2719185c4462a87f6745aa76ebedb))

- **Document --background in sp run help and guard the drift (#228)** ([d410d9b](https://github.com/xtrm-dev/specialists/commit/d410d9be725994f35e6f72d4188217d85700bb2d))

- **Reject --background --raw and tag the background launch schema (#229)** ([b1c00f9](https://github.com/xtrm-dev/specialists/commit/b1c00f96ac21dd9f24a266d770144e9b9190a586))

- **Transition dead jobs to error so the parent is notified (#232)** ([e7d467a](https://github.com/xtrm-dev/specialists/commit/e7d467ad8f2ad72c45f63800a7ca364ae61c55bf))

- **Raise hono floor to 4.12.32 (xtrm-wiy5n.4.35) (#236)** ([8cd968c](https://github.com/xtrm-dev/specialists/commit/8cd968cdccb1208546e3aaa6a8a575806a732671))

- **Refuse Node runner with a clear one-line message (xtrm-wiy5n.4.34) (#237)** ([f2940d3](https://github.com/xtrm-dev/specialists/commit/f2940d3e3a4bf839b3fa3618bc94c01253ff3361))

### Other changes

- **Fix pi-compatible JSON output for run and feed (#206)

* fix(cli): emit pi-compatible JSON events

* fix(cli): preserve replay cwd and sequence** ([922d5d3](https://github.com/xtrm-dev/specialists/commit/922d5d32bc007e9ba440084109f254fdb2d99726))

- **Fix per-job ordering in JSON feed replay (#207)

* fix(feed): preserve per-job event sequence

* fix(feed): merge per-job streams transitively** ([5fa36e0](https://github.com/xtrm-dev/specialists/commit/5fa36e03d653a5b5a5dd3431c4802942276afeae))

- **Reference service-knowledge package (PR0 relocation) (#213)** ([cb79680](https://github.com/xtrm-dev/specialists/commit/cb796800d98a3b4bf7bb48efcc7e31fb9790dec9))

- **Service-skills-sync -> service-knowledge-sync specialist (#217)** ([7f7617e](https://github.com/xtrm-dev/specialists/commit/7f7617ea696ef77fe2e424366d17d9b0f60e6aa1))

### Project maintenance

- **Auto-refresh CHANGELOG.md — pre-push hook (xtrm-reyem.12) (#208)** ([05c57e5](https://github.com/xtrm-dev/specialists/commit/05c57e568e8e11286bd159ecbc985f58e9ee5782))

- **Chore** ([601cfa8](https://github.com/xtrm-dev/specialists/commit/601cfa8e04d190831f32ab4cb817babead5433c9))

- **Reconcile enhanced PRD v3.1 (#209)** ([a11d5bc](https://github.com/xtrm-dev/specialists/commit/a11d5bcde475530cc815815ccc0fc3329590e6a8))

- **Add pr-review-gate required-status-check workflow** ([cde9fd8](https://github.com/xtrm-dev/specialists/commit/cde9fd8971e029a085d33e7131d439f92218228f))

- **Set explicit job name for readable required-check context** ([ed10f80](https://github.com/xtrm-dev/specialists/commit/ed10f806fff39da4bfe47603838625a146d8d280))

- **Drop unsupported pull_request_review_thread trigger** ([3a79f3b](https://github.com/xtrm-dev/specialists/commit/3a79f3bd732ba2c875605584d5e553823376982b))

- **Tighten to Bot __typename + paginate threads/reviews** ([448f0a6](https://github.com/xtrm-dev/specialists/commit/448f0a6aac5a43b1a0760b0caf611a41affcce71))

- **Scope tracked documentation and reconcile roadmap** ([02241c4](https://github.com/xtrm-dev/specialists/commit/02241c47732ee497d4a7b7c61d0ca3a1c9408d29))

- **Clean README whitespace** ([d1afc58](https://github.com/xtrm-dev/specialists/commit/d1afc58d0ff1cc41c768d016c1cf5a875c45cb3d))

- **Wave-2 — pull_request_review_comment trigger + preserve CR verdicts** ([91cf32d](https://github.com/xtrm-dev/specialists/commit/91cf32dc6e86bcb121501bee478230792d0f0fa6))

- **Remove tracked open issues export (#218)** ([dc8cde3](https://github.com/xtrm-dev/specialists/commit/dc8cde3145e40c52e3b23d3865413c4a5c57571e))

- **Establish issue-linked baseline quarantine** ([3ce56be](https://github.com/xtrm-dev/specialists/commit/3ce56be6920845430d614feb85338cc4ae25805f))

- **Simplify specialist monitoring guidance** ([a2619d7](https://github.com/xtrm-dev/specialists/commit/a2619d76c3a39867934f8440fe3681413bad1ee3))

- **Retire completion marker consumer** ([5c48981](https://github.com/xtrm-dev/specialists/commit/5c489813e2c8fecdc71c11f27adca6ed470cbae3))

- **Route sp run dispatch form to the CLI help (#225)** ([844ae6c](https://github.com/xtrm-dev/specialists/commit/844ae6c8bc9beacff7e86ae0088d611435f97225))

- **Map all 58 quarantined suites and restore 10 (#230)** ([ba8526c](https://github.com/xtrm-dev/specialists/commit/ba8526cd867733b8c73ee56ed5142e01e36a09f8))

- **Run the test suite on every pull request (#231)** ([c95b35c](https://github.com/xtrm-dev/specialists/commit/c95b35c2f039895b1c93d88d14d8f1f3ec2bbed2))

- **Pin bun to 1.3.14 in PR workflows (xtrm-wiy5n.4.30) (#233)** ([e7fadb8](https://github.com/xtrm-dev/specialists/commit/e7fadb8165792289ea57b1961632576bc5bf9d61))

- **Stop the progressive-disclosure doc stating counts that go stale (xtrm-wiy5n.4.23) (#235)** ([69daedd](https://github.com/xtrm-dev/specialists/commit/69daedda077d3c90661e27b506ad4949903676bc))

- **Commit the injected block, conditioned on runtime support (xtrm-wiy5n.4.36) (#238)** ([731b423](https://github.com/xtrm-dev/specialists/commit/731b4232cf8a3cb74bafee685e4658d6accccc8f))

## [v3.21.1] — 2026-07-22

## [v3.21.0] — 2026-07-18

### Added

- **Wire verified-audit skill into reviewer.specialist.json** ([0a6895c](https://github.com/xtrm-dev/specialists/commit/0a6895c95dac898f97ca6af9d94265c2c52246e5))

- **Isolate ambient pool + force turn-1 body load (unitAI-0o3pv, -qeguh, -uv1yg)** ([3d77800](https://github.com/xtrm-dev/specialists/commit/3d7780010061d844363436452aca5257da6f8d82))

- **Add --surface to sp view (#195)** ([ab88775](https://github.com/xtrm-dev/specialists/commit/ab8877542c07668ee0a359b226402b02a9135c86))

- **Help audit + cliff cleanup + repo metadata + release docs (r6g.3, WIP) (#196)** ([0f4a31d](https://github.com/xtrm-dev/specialists/commit/0f4a31d316a277c2b51ec56e04c659de48987b83))

### Fixed

- **ESRCH crash in Background jobs check** ([76ce52a](https://github.com/xtrm-dev/specialists/commit/76ce52adc4148b0b9140b864ebc51445fe318944))

- **Skip template specialists in model-configured check + skip null-id sqlite rows** ([0d450ed](https://github.com/xtrm-dev/specialists/commit/0d450ed48d65543336d35ea172af16a17a329765))

- **Bump stall_timeout_ms + Phase 6 self-open-PR (xtrm-efa2a.1, xtrm-vu2ro.1) (#192)** ([7bcd3a0](https://github.com/xtrm-dev/specialists/commit/7bcd3a06f25e376706d949bbbd6b97f0dd81c390))

- **Render Claude skill commands separately** ([2fbcabd](https://github.com/xtrm-dev/specialists/commit/2fbcabd4c1498927dea248ee9d6e0192cf13f62e))

- **Rebuild Claude skill prefix distribution** ([d560314](https://github.com/xtrm-dev/specialists/commit/d5603144a9ba97b154cb32b42f214a572029d401))

- **Trust OSV verdict and preserve unknown launch mode** ([578ef90](https://github.com/xtrm-dev/specialists/commit/578ef9090a56de5d19016f56e45df6f3c443fbb9))

- **Reject OSV scanner operational exits** ([4e37caa](https://github.com/xtrm-dev/specialists/commit/4e37caa6bed9ebfa85e304dbcef5d7aa31c4e7d1))

- **Isolate pull request workflow trust boundary** ([797b8f3](https://github.com/xtrm-dev/specialists/commit/797b8f3baf4148f880ef9eb1903e46f16e89cb5b))

- **Close PR 193 Ubuntu CI gaps** ([c5d46fe](https://github.com/xtrm-dev/specialists/commit/c5d46fef38c29a1f5911e2d222021f5e7ba78937))

- **Reject compound PR workflow guards** ([e93d8bd](https://github.com/xtrm-dev/specialists/commit/e93d8bdf6ad256bbcdc2bba63af84b7af61d37b0))

- **Validate rendered skill names** ([e44b451](https://github.com/xtrm-dev/specialists/commit/e44b4515fa6862032b9f84c1ac637420150eeb50))

### Other changes

- **Orphan releasing/SKILL.md — core owns it** ([455e123](https://github.com/xtrm-dev/specialists/commit/455e12321c93bd80c39478641a7a69449c63ce53))

### Project maintenance

- **Record the post-release launcher smoke** ([670d213](https://github.com/xtrm-dev/specialists/commit/670d2134ee6fff2ab12158c49b460e0c76bd3555))

- **Correlate xtmux coordination replies (#188)** ([a575696](https://github.com/xtrm-dev/specialists/commit/a575696f32862c9d548fd4b09f5a3cf42c0254c1))

- **Reviewer-path interaction with /skill: prefix** ([f6fdb90](https://github.com/xtrm-dev/specialists/commit/f6fdb90177b2b4be1c9ffded8a3739cc43a32ddb))

- **Retire repo-local mirror checks, redirect to global vendored paths** ([d0ce4c2](https://github.com/xtrm-dev/specialists/commit/d0ce4c29077680f25847e3ecf1d1a91fd2503788))

- **Refresh [Unreleased] with verified-audit wire** ([ec36b3f](https://github.com/xtrm-dev/specialists/commit/ec36b3fc1bc2b3d846af68a130eec5cd4c4b9253))

- **Resync task-prompt d.ts with source docstring** ([9f86070](https://github.com/xtrm-dev/specialists/commit/9f860700657d40475fdc030772adfda6c5726438))

## [v3.20.0] — 2026-07-14

### Other changes

- **PR E — runtime-origin: direct spawn binding (E1..E6, epic unitAI-z8uli) (#185)

* chore(changelog): add git-cliff config and changelog

Generic type-based parsers; repo-specific scopes to be tuned (see P0 bead).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>

* feat(runtime-origin): add RuntimeOriginV1 module (E1)

Adds src/specialist/runtime-origin.ts: the leaf module the whole runtime-origin
integration builds on (spec /home/dawid/dev/xtmux docs/xtmux-gaps.md §11, §13.1-4).

- RuntimeOriginV1 type verbatim from spec §11.
- SpecialistSpawnOriginV1 discriminated union (§13.3) — consumed by E4.
- SPECIALISTS_RUNTIME_ORIGIN_V1 env var name constant.
- validateRuntimeOrigin: strict schema check with unknown-field rejection.
  Forward-compat via schema_version bump, not silent pass-through.
- captureRuntimeOrigin: DI-injectable subprocess runner, 500ms timeout,
  never throws. Returns undefined on outside-tmux / ENOENT / non-zero /
  parse-fail / schema-fail / oversize / runner-throw.
- decodePropagatedOrigin: auto-detects raw JSON vs base64url from leading
  char; preserves `verified`; rewrites capture_source='propagated'.
- encodePropagatedOrigin: base64url canonical encoding.

Log surface: single-line `[specialists] component=runtime-origin
event={capture,propagate,reject} outcome=... reason=... duration_ms=...`
via console.warn. Never logs raw JSON payload. 16KiB payload cap.

Failure behavior non-negotiable per spec §15: NEVER fails a Specialists
run; NEVER fabricates a binding.

Bead: unitAI-z8uli.1 (epic unitAI-z8uli PR E direct spawn binding).
33 tests pass, tsc clean.

* feat(runtime-origin): capture at sp run boundary + background propagation (E2+E3)

E2 (unitAI-z8uli.2) — capture BEFORE --background branch (spec §13.1):
The invoking pane's identity must be resolved here. The detached child's
TMUX_PANE resolves to the sp-* feed pane, so capture MUST precede the
detach. A propagated origin in the environment (background re-invocation)
wins over ambient capture — the child rediscovering its own sp-* pane is
the exact bug the propagation exists to prevent.

E3 (unitAI-z8uli.3) — SPECIALISTS_RUNTIME_ORIGIN_V1 through detach (§13.2):
When ambientRuntimeOrigin is present, encodePropagatedOrigin (base64url)
injects it into the child env via BOTH branches — createTmuxSession's
extraEnv and cpSpawn's env — so the child's `sp run` decode step recovers
the original pane's origin instead of ambient-capturing its own sp-* pane.

No child env noise when no origin exists — empty {} spread.

Downstream: launchSpecialist call still receives no origin — E4 threads
it through RunOptions → SupervisorStatus → run_start.

Smoke: `bun run src/index.ts run --help` exit 0.
Tests: 33/33 in tests/unit/specialist/runtime-origin.test.ts pass.
tsc clean for run.ts.

* feat(runtime-origin): thread SupervisorStatus + RunOptions + run_start (E4)

Types added:
- RunOptions (runner.ts): ambientRuntimeOrigin, explicitParentJobId.
- LaunchSpecialistOptions (launch.ts): same two fields, forwarded into
  the RunOptions constructed for Supervisor.
- SupervisorStatus (supervisor.ts): spawn_origin, parent_job_id,
  root_runtime_origin (all optional; no schema migration — persisted into
  status_json blob per spec §13.6).
- SupervisorStatus.startup_context: compact projection —
  spawn_origin_kind, parent_job_id, root_pane_id, root_agent_instance_id.
- TimelineEventRunStart.startup_snapshot: same compact projection.

Precedence codified per spec §13.4:
- resolveSpawnOrigin() helper in runtime-origin.ts encapsulates the
  explicit parent > ambient > unknown decision. Kept in the leaf module
  so precedence is unit-testable in isolation. F2 (unitAI-z8uli.8)
  refines the specialist.job case by looking up the parent's stored
  root_runtime_origin so the whole chain shares one root.

Wiring:
- cli/run.ts launchSpecialist call passes ambientRuntimeOrigin captured
  in E2.
- launch.ts forwards both fields into Supervisor's RunOptions.
- supervisor.ts:1274 initialStatus construction runs resolveSpawnOrigin
  once and populates status + startup_context together.
- observability-sqlite.ts readForensicContext surfaces the persisted
  origin fields verbatim from status_json (E5 tightens types when it
  builds the ForensicSpawnedByLink shape).

Non-regression check:
- runtime-origin.test.ts 38/38 pass (+5 for resolveSpawnOrigin).
- Baseline supervisor.test.ts pre-existing failures verified equal
  with/without this change (37 fail, 3 errors — events.jsonl ENOENT
  in test env, not runtime-origin-related).
- tsc clean.

Bead: unitAI-z8uli.4.

* feat(forensic): enrich job.started with typed origin links + labels guard (E5)

Adds the durable pane→job / job→job forensic link surface (spec
docs/xtmux-gaps.md §13.5, §16).

Types:
- ForensicCorrelation.parent_job_id typed field (was catch-all).
- ForensicSpawnedByLink discriminated union — pane form
  (xtmux.agent_instance + host_id + full tmux ID triple + optional
  agent_instance_id) or child form (specialist.job + job_id).
- ForensicRootRuntimeOrigin — compact projection (host_id + tmux_pane_id
  + optional agent_instance_id). Only fields needed to reconnect a job to
  its root pane; captured_at_ms / capture_source / verified / bead_id
  stay in status_json, not in the durable forensic link.

Emission:
- forensicEventFromTimelineEvent(run_start, ...) attaches typed
  `links.spawned_by` + `links.root_runtime_origin`. Only run_start.
- bodyForTimelineEvent gained a 2nd context param and a 'run_start' case:
  body.origin_source ∈ {xtmux-context, propagated, child-of-specialist,
  none}; body.origin_verified; body.launch_mode ∈ {foreground, background,
  unknown} — derived from origin_source (propagated ⇒ background).
- correlation.parent_job_id populated for child jobs only.

Whitelist projection:
- projectSpawnedByLink / projectRootRuntimeOrigin exported. Both strip
  unknown fields — defence against future RuntimeOriginV1 additions
  bleeding into the immutable event surface. Adding a field to the link
  requires an explicit whitelist change here.

Prometheus label guard:
- FORBIDDEN_PROMETHEUS_LABELS gains parent_job_id, agent_instance_id,
  host_id, tmux_session_id, tmux_window_id, tmux_pane_id (spec §16).
  Test asserts each. High-cardinality identifiers stay in
  forensic-correlation / links / Console read models — never labels.

Reader contract:
- No links.spawned_by is emitted for kind:'unknown' — reader assumes
  missing = no known binding.
- No links entry on non-run_start events.

Observability wiring:
- observability-sqlite.ts writeForensicEventRow threads parentJobId,
  spawnOrigin, rootRuntimeOrigin (read from status_json by
  readForensicContext in E4) into the emitter context.

Tests: 21 new (forensic-run-start-origin.test.ts) + 26 pre-existing
forensic-events.test.ts all green. tsc clean.

Bead: unitAI-z8uli.5.

* feat(ps): expose spawn_origin / parent_job_id / root_runtime_origin (E6)

sp ps --json (both --inspect and flat list) and human --inspect now expose
the runtime-origin fields recorded on SupervisorStatus (spec §13.7).

- renderInspectJson: additive spread of spawn_origin, parent_job_id,
  root_runtime_origin — absent for legacy rows to keep --json output
  byte-stable.
- renderJson flat list: same three fields per row.
- renderInspect human: one compact line, only when origin is present:
    spawned-by host-<8> / <session>:<pane> / agent <8>
    spawned-by specialist.job <parent-8>
  Never a misleading "unknown" line — kind:'unknown' renders nothing.

Exported formatSpawnedByLine for isolated unit-testing. 5 formatter
tests cover pane origin, agent-optional path, specialist.job form,
absent origin, kind:'unknown'. tsc clean; sp ps --help smoke green.

Bead: unitAI-z8uli.6.

---------

Co-authored-by: jaggerxtrm <dawid.jgg@gmail.com>
Co-authored-by: Claude Opus 4.8 (1M context) <noreply@anthropic.com>** ([5f3dfc4](https://github.com/xtrm-dev/specialists/commit/5f3dfc414dbcdd1169d1096a512d9d46beb7bfa1))

- **PR F — runtime-origin: descendant lineage + E2E reconstruction (F1..F4, epic unitAI-z8uli) (#186)

* feat(launch): explicit parent_job_id on internal member spawns (F1)

Threads explicitParentJobId through the only two internal sites that create
a separate SupervisorStatus from inside a running specialist context:

- job-control.ts:startJob signature accepts optional explicitParentJobId
  and merges it into RunOptions. E4's resolveSpawnOrigin already consumes
  this as the top-precedence gate — a populated value flips the child's
  SupervisorStatus.spawn_origin.kind to 'specialist.job'.

- node-supervisor.ts member-spawn call sites (primary spawn + replacement
  respawn) now pass explicitParentJobId: this.coordinatorJobId when the
  coordinator id is known.

Every internal dispatch emits:

    [specialists] component=launch event=child-dispatch
      parent_job_id=... node_id=... member_id=... outcome=ok

Sites deliberately NOT touched:
- Coordinator spawns — ROOT of node execution, no parent.
- spawnDynamicMember — public API without owner context in scope.
- use_specialist.tool — runner.run() directly, no separate SupervisorStatus.
- cli/chat.ts + cli/node.ts — user-invoked, not specialist-invoked;
  ambient-origin capture at those entry points is an E2 gap, follow-up.
- script-runner.ts — READ_ONLY sp script, no job lifecycle.

tsc clean; runtime-origin / forensic / ps unit tests still 64/64 green.

Bead: unitAI-z8uli.7.

* feat(supervisor): inherit root_runtime_origin from parent job (F2)

When an initial SupervisorStatus is being constructed for a child job
(runOptions.explicitParentJobId set), the supervisor reads the parent's
persisted SupervisorStatus via sqliteClient.readStatus and inherits its
root_runtime_origin into the child's own status.

E4's resolveSpawnOrigin helper accepts inheritedRootRuntimeOrigin as its
third input; F2 just wires the value. The whole chain A → J1 → J2 → ... → Jn
now shares one root pane binding.

Failure behavior:
- Missing parent status (parent already terminal / never persisted):
  root_runtime_origin stays undefined. NEVER fabricated.
- Sqlite lookup throws: caught, logged, no fabrication. Child allocation
  still succeeds — the epic's failure-behavior invariant holds.

Log surface:
  [specialists] component=launch event=inherit
    parent_job_id=... outcome={ok, parent-missing, lookup-failed}

The precedence rule (explicit parent > ambient > unknown) is unchanged.

Bead: unitAI-z8uli.8. tsc clean; 64 tests still green.

* feat(runtime-origin): forensic lineage reconstruction + redaction sweep (F4)

Adds the F4 acceptance surface for spec §18 end-to-end fixture and §16
redaction rules.

New module: src/specialist/runtime-origin-reconstruct.ts
- reconstructLineage(events) → Map<job_id, ReconstructedJobNode>. Pure
  functional over ForensicEvent[]; no live sqliteClient, no jobRegistry,
  no tmux. This is exactly the Console (§14) read model at the forensic
  level.
- redactionSweep(events) → { forbidden_label_hits, payload_leaks }.
  Scans event.resource for any of the 6 forbidden runtime-origin
  identifiers (spec §16) and event.body for prompt/raw_command/raw_diff/
  model_output/raw_error leaks. Regression guard for future emission
  changes.

Integration test: tests/integration/specialist/lineage-e2e.test.ts
- A (pane %17) → J1 (background, propagated origin) → J2 (child of J1):
  reconstruction proves J1<->A, J2<->J1, J2<->A all resolvable from the
  event stream alone.
- Outside-tmux negative control: no spawned_by, no root_runtime_origin.
- Purity: reconstruction is idempotent over independent calls (no
  hidden runtime state).
- Clean sweep: zero forbidden-label hits, zero payload leaks on the
  fixture stream.
- Synthetic regressions: forbidden label promoted onto resource, and
  prompt leak in body, are both caught.

Live-with-real-xtmux gate: deferred until xtmux-j46.2 lands on xtmux
main. The reconstruction CONTRACT is verified today.

Total: 70 tests pass across 4 files (runtime-origin, forensic-run-start-
origin, ps-spawned-by-line, lineage-e2e). tsc clean.

Bead: unitAI-z8uli.10.** ([62af1ee](https://github.com/xtrm-dev/specialists/commit/62af1ee60501b46d7a51aea5f0b9f231b3d738a1))

## [v3.19.0] — 2026-07-14

### Added

- **Expose read-only task-prompt renderer (sp render-task)** ([147c671](https://github.com/xtrm-dev/specialists/commit/147c67125fcb04e659934bacfa2bb4d9e47a2359))

  Extract sp run's task-side prompt assembly into one pure seam
  (src/specialist/task-prompt.ts renderTaskPrompt) and reuse it from a new
  read-only CLI so `xt pi/claude --role` can send the same initial user prompt
  without forking renderer logic. SpecialistRunner.run now delegates to the seam;
  buildBeadContext / renderTemplate / buildMandatoryRulesInjection are unchanged.

  Execution-only steps stay out of the renderer: pre-scripts and the reviewer
  git-diff context (the latter enters sp run via appendExecutionContext, still
  before the hash, so prompt_hash semantics are unchanged). Mandatory-rule
  resolution failure is fatal for the renderer but keeps sp run's warn-and-skip.

  Dedup chain-coordinator task_template: $prompt and $bead_context both resolved
  to the same string, rendering the full bead context twice on every tracked run.

  Closes unitAI-6639v.1, unitAI-6639v.4

### Fixed

- **Repoint skill refs to the global root and hard-fail missing skills** ([3f829b6](https://github.com/xtrm-dev/specialists/commit/3f829b6534247f8cdb036cc39a3feb42d5d1f77a))

  The global-skills migration retired `.xtrm/skills/active/` in favour of
  `~/.xtrm/skills/default/`, but every vendored specialist still pointed at the
  old root. Nothing surfaced it: the loader passed bare relative paths through
  unchanged, validateBeforeRun only warned, and pi silently ignores a
  nonexistent `--skill` (exit 0, no diagnostic). chain-coordinator and its
  siblings had been running with no skills loaded at all.

  Repoint every stale reference, not just skills.paths: bare skill names and the
  repo-local memory-audit-transaction path resolved against cwd and broke inside
  worktrees; sync-docs' pre-script pointed at a file that no longer existed (it
  never hard-failed because the check only verifies the `bash` binary); and
  researcher's prompt prose named the retired root.

  Promote a missing declared skill from a warning to a pre-launch hard failure so
  a stale skill path can never again reach pi unnoticed.

  Closes unitAI-6639v.2.1

- **Stop re-expanding variables inside bead content** ([ca46e59](https://github.com/xtrm-dev/specialists/commit/ca46e59a22c8ce05e09c5146cd3ad1f15e70fa15))

  The task render ran twice: the first pass substituted $prompt with the bead
  body, and the second re-scanned the result. A bead whose text contained a
  literal $cwd or $bead_id therefore had it replaced with the real value — bead
  content was being treated as template source.

  Render once over the original template with the union variable map. Every
  template-origin token still resolves; only the injected content is no longer
  re-scanned.

  Closes unitAI-6639v.5

### Project maintenance

- **Add git-cliff config and changelog** ([d648135](https://github.com/xtrm-dev/specialists/commit/d64813593f8996ed02e4dc3d92ad813d20f31bf7))

  Generic type-based parsers; repo-specific scopes to be tuned (see P0 bead).

- **Split using-specialists into a router + on-demand references** ([b973312](https://github.com/xtrm-dev/specialists/commit/b973312dd2f53368b5218b5b0938a86f6704d08e))

  using-specialists was a 1416-line monolith injected in full into every session
  that referenced it — 98KB of eager context for chain-coordinator, most of it
  irrelevant to the phase it was in.

  Split it into a 256-line router that carries only always-needed policy (rules,
  gates, specialist choice, escalation, promotion gate) plus six bundled
  references loaded per phase. Sections were moved verbatim by line range, and
  references/content-migration-map.json records where each of the 41 original
  sections went, so "no content loss" is machine-testable rather than asserted.
  Coordinator eager payload drops to 21,689 bytes (-78%).

  The asset-contract generator collected only files literally named SKILL.md, so
  bundled resources would have shipped untracked and a missing reference could
  pass release and fresh-install validation unnoticed. It now tracks everything
  under config/skills except evals/, which also closes a pre-existing gap where
  four shipped skill scripts were absent from the contract.

  Closes unitAI-6639v.2.2

- **Validate progressive disclosure, selective loading, and role parity** ([23cd9e1](https://github.com/xtrm-dev/specialists/commit/23cd9e19dadc36abde48f4be501051b4ad0f6171))

  Covers unitAI-6639v.3: prove the split skill preserves behaviour, that an agent
  loads only what its phase needs, and that the three surfaces that build a task
  prompt agree.

  - role-envelope-parity: the pi/claude/sp-run matrix from the .1 parity decision.
    pi and claude are byte-identical on the task side; sp run differs only by the
    execution-only layers (pre-scripts, reviewer diff); prompt.system never leaks.
  - selective-loading: each phase has exactly one owning reference, the router
    routes to it, and the router alone answers always-needed policy. Cross-file
    references are pointers, not copies — ownership is the invariant.
  - three progressive-disclosure eval scenarios, each asserting the agent does NOT
    open references irrelevant to its phase.
  - benchmark artifact comparing v3.7 with v3.8, incl. live smoke transcripts and
    the known limitations.

  Closes unitAI-6639v.3

## [v3.18.3] — 2026-07-13

### Changed

- `using-specialists` skill and the `chain-coordinator` specialist now use the `xtmux` command prefix instead of the legacy `tmux-session-picker` name for coordinator→orchestrator escalation. `chain-coordinator`'s `external_commands` allowlist was updated to match, so the coordinator can actually run the command its prompt names (xtmux-d0a.22, #184).

## [v3.18.2] — 2026-07-12

### Added
- **Interactive chain coordination specialist (`unitAI-f9ixg`, #175).** Added `chain-coordinator` for tracking and coordinating interactive epic chains.

### Changed
- **Canonical orchestration skill (`fa893e36`).** Consolidated versioned `using-specialists-v2`/`v3` guidance under `using-specialists`; existing-project sync removes retired managed copies while preserving user-owned active skills.
- **Effective-spec inspection (`xtmux-1lb.4`, #178).** `sp view --raw` now returns the merged effective specification.

- **Unified code-restraint discipline across mandatory-rule + orchestrator skill (`unitAI-pzmwf`).** The single-line `code-quality-defaults` mandatory rule (SRP/DRY/KISS/YAGNI) is now the canonical home for the full restraint lens executor/reviewer/seconder share: the 7-rung ladder (YAGNI → reuse → stdlib → native → installed dep → one line → minimum), rules against unrequested abstractions and premature scaffolding, an explicit "never simplify away" boundary (input validation at trust boundaries, error handling that prevents data loss, security, accessibility, explicitly requested behavior, understanding the problem), a `// SIMPLIFIED: <ceiling>. upgrade when <trigger>.` marker convention for deliberate shortcuts (unmarked shortcuts silently rot; marked ones stay tracked), and the finding-report tag vocabulary (`delete: / stdlib: / native: / yagni: / shrink: / keep:`) that both reviewer and seconder now cite verbatim in their smell-pass sections. Reviewer's system prompt gained a `## Simplification Findings` section that instructs it to cross-check every proposed cut with `gitnexus_impact` before recommending and to refute overclaimed shrinks with `keep:` naming the load-bearing reason. Seconder's `## Quality smell pass` now emits `quality_findings` entries using the same tag vocab in the `issue` field. `config/skills/using-specialists/SKILL.md` gained a `## Restraint And The Ladder` section teaching the orchestrator to write narrower SCOPE / explicit NON_GOALS in bead contracts, consume `shrink:`/`delete:` findings verbatim during review loops, apply the same ladder when implementing directly, and pick between one-bead-vs-epic scoping by a 30-minute bounded-diff heuristic. Zero external plugin brand references in shipped text — this is the specialists ecosystem's own discipline, not a rebadge.

### Fixed
- **Terminal result fallback (`#179`).** Completed jobs preserve fallback output when the terminal event has no text.

- **Terminal-alive orphan reaper — pi keep-alive sessions no longer leak indefinitely (`unitAI-yme9q`).** Closes the class of orphans surfaced by a live audit: 8 real jobs across `dev/console` with SQLite rows marked `done`/`error` for 60–180+ minutes while their bun wrapper and detached `pi` child (plus 10 MCP workers each in the worst cases) were still running, plus a 28060-minute-old zombie in `mercury/quant`. Root cause: standalone `sp run <spec> --bead ... &` invocations dispatch a keep-alive `pi` session whose `closeFn()` is only invoked by an external actor sending `{type:"resume"|"close"}` over the job's FIFO or by the `waiting_auto_close_ms` watchdog (default `0`/disabled) — with neither present, the session survives the job's terminal transition indefinitely. Every existing cleanup surface missed it: `collectStaleSpecialistJobs` filtered to `starting|running|waiting` (explicitly excluding terminal jobs), `orphaned-keep-alive` additionally required `ppid===1` (none of the leaked processes were reparented because their tmux/shell parent was still alive), and `sp stop` short-circuited to "already finalized" without checking real PID liveness. Three-surface fix: (a) `collectStaleSpecialistJobs` in `src/specialist/process-health.ts` gains a second pass over `done|error|cancelled` statuses whose PID is still alive past `minTerminalAliveAgeMs` (default 60s — pi's own group-SIGKILL backstop is 8s, so anything past a minute is definitively leaked), yielding a new `reason: 'terminal-alive'` that does NOT require `ppid===1`; (b) `reapStaleSpecialistJobs` in `src/cli/clean.ts` kills the whole process group (SIGTERM → 500ms grace → group-SIGKILL to `-pid`) so the detached pi child and its MCP workers all die together, without overwriting the DB row (job was correctly terminal, only the process leaked); (c) `stopJob` in `src/specialist/control.ts` now checks `isProcessAlive(pid, started_at_ms)` before returning "already finalized", emits a new `stop_terminal_alive_reaped` control event, and prints `Reaped orphaned PID <pid> for job <id>`. Verified end-to-end: `sp clean --reap-orphans` detected and killed a seeded orphan (message: `Reaped 1 stale specialist job`), `sp stop <job>` group-killed a real 12-hour-old sleep-3600 detached child in <2s. 8 new/updated unit tests (`process-health.test.ts` + `stop.test.ts`) plus a `StatusFixture` test helper that clears long-standing tsc excess-property noise across the whole file. Full `bunx tsc --noEmit` clean; targeted vitest 29/29.

## [v3.18.1] — 2026-07-04

### Added
- **Live tmux panes for background specialists (`specialists-14k`, PR #163).** `sp run <name> --background` now launches the real run in the tmux pane, waits for the `SPECIALISTS_BG_JOB_ID_PATH` handoff, then switches the same pane to `sp feed <job> --follow`. Operators selecting the tmux session see the same timeline as `sp feed` without manually running a second command. The handoff emits `tmux_live_feed_started` telemetry and preserves prompt redaction; smoke fixed the wrapper's shell background syntax before linking globally.
- **Full assistant text in `sp feed` (`specialists-2jc`, PR #163).** Feed timeline `text` events can now carry non-thinking assistant `content`; human feed renders multiline assistant messages with deterministic truncation markers, while JSON/NDJSON consumers remain backward-compatible with legacy `text` events that only have `char_count`. Pi session plumbing extracts assistant text from streaming `text_delta`, `message_end`, and final `agent_end` boundaries, de-dupes duplicate terminal content, and keeps thinking/reasoning events separate.
- **Durable PR/base drift fields on specialist_jobs (`specialists-05q.1`).** V13 schema migration adds 10 nullable columns to `specialist_jobs` (`pr_url`, `pr_head_sha`, `pr_state`, `pr_merge_state`, `pr_classification`, `pr_base_ref`, `pr_base_sha`, `pr_drift_checked_at_ms`, `base_sha_pinned`, `base_sha_pinned_at_ms`). `SupervisorStatus` gains matching optional fields for serialization symmetry. New typed surface on `ObservabilitySqliteClient`: `PrDriftState`/`PrDriftStatePatch` types, `readPrDriftState(jobId)`, `updatePrDriftState(jobId, patch)` (partial-update; `null` clears, omitted keys unchanged). Backward-compatible — old JSON blobs decode with the new fields undefined. Bridge → substrate: columns rename 1:1 onto `containers.*` per specialists-roadmap §B.3.
- **Stale-base fetch-and-pin gate + `--accept-stale-base --reason` (`specialists-05q.3`).** `sp run` gains `--base-sha <sha>`, `--base-ref <branch>`, and `--accept-stale-base --reason "<text>"`. New `resolveBasePin()` runs `git fetch` and computes a structured refusal envelope on stale base: `{ ok: false, error_code: "stale_base", blocked_by, next_safe_action, base_sha_pinned, base_sha_observed, current_sha, branch, worktree_path, commits_behind }`. Fetch failures emit `error_code: "base_fetch_failed"` with `{ blocked_by: ["fetch_or_resolve_failure"], underlying_error }` rather than crashing dispatch. `--force-stale-base` retained as a deprecated alias with a one-line stderr deprecation warning. Pin is persisted via `updatePrDriftState({ base_sha_pinned, base_sha_pinned_at_ms })` on the chain-identity row.
- **PR drift refresh + attention surface (`specialists-05q.2`).** `doctor --pr-drift` shells out to `gh pr view --json state,mergeable,mergeStateStatus,baseRefName,baseRefOid,headRefOid` for each PR-linked job whose `pr_drift_checked_at_ms` is stale (default: > 5 min) or null. `deriveClassification()` maps GitHub status to the canonical vocabulary: `clean | needs-rebase | conflicted | blocked | stale | unknown`. `gh` failures (missing binary, network, no PR) classify as `unknown` and emit a sha256-hashed `gh_stderr_hash` field — `refreshPrDriftForJob` never throws. Structured log per refresh: `{ component: "pr_drift", event: "refresh_attempted"|"refresh_completed"|"refresh_failed", job_id, duration_ms, gh_stderr_hash, pr_classification, branch?, checked_at_ms? }`. `sp ps` gains a `[drift:<classification>]` badge on the status line for non-clean classifications, a `--needs-attention` filter flag (keeps only jobs whose `pr_classification` is non-clean), and `sp ps --json` adds an additive `attention_reasons[]` array. New `listJobsNeedingPrDriftRefresh(olderThanMs?)` helper on `ObservabilitySqliteClient`.
- **Dead-job audit (`specialists-05q.4`).** `doctor --reap-dead-jobs [--dry-run] [--json]` scans `specialist_jobs` rows in active states (`starting`/`running`/`waiting`) with PIDs that fail `process.kill(pid, 0)` (ESRCH) and have been idle for > 60s. Conservative predicate (all four conditions must hold) prevents false dead-marking. Cancellation reason: `container-restart-orphan`. Each finding emits one `xtrm.forensic.v1` event `{ event_family: "lifecycle", event_name: "dead_declared", body: { job_id, pid, age_ms, reason, dry_run } }` (suppressed in dry-run) plus a structured stderr log. New `collectStaleSpecialistJobs({ minAgeMs })` query helper. JSON envelope: `{ dryRun, found:[{job_id, pid, reason, age_ms}], cancelled }`.

### Changed
- **`executor-delivery` mandatory-rule: scope allowlist + never-close-anchor-bead (EVAL-10/13, `mercury-market-data-i2kb`).** Extracted from mmd-sprint 2026-07-03. Executor now must parse the bead's `SCOPE` section into an explicit path allowlist before the first edit and refuse `git commit`/`push` if any staged path is outside the allowlist — closes the systemic scope-pollution failure where two workers force-pushed `.serena/project.yml`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`, and an unrelated chore commit alongside their real fix. Executor also must not close the anchor bead; anchor closure is a post-verification concern owned by the orchestrator after judge PASS + deploy-monitor window clean.
- **`test-runner-execution-scope` mandatory-rule: bash-pytest fallback + CI-parity pyright (EVAL-11/15, `mercury-market-data-3ele`).** On tool-call-parse failures from the underlying model (observed against Kimi during mmd-sprint 2026-07-03), test-runner now falls back to invoking the same command directly via bash (`pytest`, `npm test`, etc.), labels the result `fallback:bash`, and records the parse-error signature so orchestrators can steer subsequent runs off the failing backend — a tool-call-parse error is a model-runtime bug, not a test failure. Pyright must run the way CI runs it (same version, same venv-activation state); a local pyright pass under a divergent environment hides `NaTType | Unknown` and similar stub-visibility drift that only fails at merge time.
- **`using-specialists-v3` skill: contract:draft/ready bead-promotion gate + rule #15 hard-refuse (v3.6 → v3.7).** Adds new rule #15 to the Never-Do checklist ("Never dispatch a specialist against a bead tagged `contract:draft`"), a "Draft Beads And The Promotion Gate" section teaching the two-phase capture-then-promote workflow (`bd create --labels contract:draft` → `bd set-state <id> contract=ready` before dispatch), and a Table-updates row on `contract:draft` dispatch. Ported from xtrm-tools PR #351 (`xtrm-824xs`); closes the vendor-drift concern tracked as xtrm-tools bead `xtrm-rcsmu`.
- **`using-specialists-v3` skill: canonical bead nesting + title convention (`unitAI-2mro0`, v3.5 → v3.6).** `bd create --parent` was previously framed as epic-only ("epic-child edge"), so orchestrators defaulted every explorer/executor/reviewer/seconder/security bead spawned mid-chain to a loose top-level bead instead of nesting. The skill now clarifies `--parent` works on any bead type and nests recursively (`bd-x.1.1`), and defaults to nesting any specialist-dispatch bead under the bead it services, combined with typed `bd dep add --type` edges for semantic relationship. Also canonicalizes the `<specialist-role>: <task>` bead title convention (previously a single ad hoc example) via a new "Bead Title Convention" section, with root task/epic umbrella beads exempt. Canonical single-chain and multi-chain flow examples updated to demonstrate both. Swept to all fleet repos under `~/dev` and `~/projects/mercury`.
- **`specialists-roadmap.md` §B durable runtime track + ownership split (`specialists-05q.5`).** New section pins ownership of PR/base drift work across four owners (xt / sp / bd-substrate / xtrm-Mercury collaborator doc) with a 4-row migration table (PR drift fields, base_sha pin, attention view, dead-job audit) using `rename`/`attach`/`retire` migration-shape vocabulary. Inline notes on §3.2 Opp 1 (lease arbitration belongs to bd merge-slot, NOT new `sp lease*` columns) and Opp 7 (absorbs `specialists-05q.3` fetch-and-pin base SHA semantics — not a new opportunity). No changes to the existing twelve-opportunity structure.

### Fixed
- **`sp merge` rebuild step skips non-Node repos (mmd-sprint memory `sp-merge-tsc-false-positive`).** `runRebuild` in `src/cli/merge.ts` unconditionally shelled out to `bun run build`, which failed on Python (and other non-Node) repos with no `package.json` or no `scripts.build`. Sibling `runTypecheckGate` already skipped when no `tsconfig.json` was present; the parallel guard was missing from `runRebuild`. Added `hasNodeBuildScript()` helper that reads `package.json` for a non-empty `scripts.build` and skips with a clear "no package.json build script — non-Node repo" message. Also clarified the tsc-gate skip message to say "non-TS repo" instead of the ambiguous "no tsconfig". Full `bunx tsc --noEmit` clean.
- **`sp ps` / `sp status` reconciliation (`specialists-otm`, PR #163).** Shared status loading now merges SQLite and legacy file snapshots by freshness, repairs stale active rows when a terminal `run_complete` exists, and records dead-job evidence without hiding actionable rows. Malformed `status_json` rows are filtered instead of collapsing the whole dashboard to zero jobs, so `sp ps`, `sp ps --json`, and `sp ps <job>` agree across running, waiting, terminal, dead, and cleaned rows.
- **Gitleaks historical baseline (`unitAI-xsrpn`).** Added a redacted Gitleaks baseline for acknowledged 2025 history findings and wired PR/push/scheduled scans to `--baseline-path`, so CI blocks new leaks without repeatedly failing on immutable historical debt.
- **release-gate core co-vendoring dispatch (`unitAI-p1ecm`).** The release-gate workflow now dispatches asset-contract validation directly to `xtrm-dev/core` via `gh api` with raw JSON, avoiding the `peter-evans/repository-dispatch` redirect/content-length failure from the old `Jaggerxtrm/xtrm-tools` target. Payload now sends `specialists_tag` as `v<package_version>` instead of `master`.

## [v3.18.0] — 2026-06-24

### Added
- **`sp console` v2 — full TUI rewrite (epic `unitAI-ctb4u`, PR #125).** Replaces the original prototype console with a complete multi-view terminal UI built on `@earendil-works/pi-tui`. Views: `ps` (live process list with tree depth, context %, status glyphs, column-adaptive layout), `feed` (live/forensic event stream with follow mode), `job` (inspect fields + action list), `result` (full job output), `bead` (linked bead doc + live state), `diff` (worktree + commit SHA fallback), `config` (global `user.json` override editor), `repoConfig` (repo registry management). 24-bit ANSI palette sourced from mock-v2 design doc. Keybindings: `↑↓`/`j/k` navigate, `↵` open feed, `r` result, `i` inspect, `b` bead, `d` diff, `g` config, `R` repos, `h` history, `a` all, `/` filter, `x` stop, `tab`/`1-9` switch repo, `0` ALL view, `q` quit.
- **ALL view — aggregated cross-repo dashboard with cursor navigation.** Opening `sp console` now lands on an ALL view (`0` to return from any tab) showing active jobs across all configured repos sorted by activity, with per-repo section headers. `↑↓`/`j/k` moves a cursor through individual job rows; `↵` opens the selected job's feed, `r`/`i`/`b`/`d`/`g`/`R`/`x` work as in `ps` — automatically switching to the job's repo before opening the view. The stats bar always shows full ps-style metrics (health / rss / cpu / orphans) for the current repo on all tabs including ALL.
- **`x` — stop job keybinding in `ps` and `all` views.** Pressing `x` on any selected or cursor job sends SIGTERM via `stopJob` in `control.ts`, using the job's own repo `jobsDir`. A brief confirmation message (`sent SIGTERM to <job-id>`) appears in the status bar. Works in both `ps` (selected row) and `all` (cursor row, cross-repo).
- **Multi-repo auto-discovery and `console.json` persistence (PRs #141, #143).** `sp console` auto-discovers sibling repos up to depth 2 (worktree-safe: skips `.git/` trees and the `specialists` package itself) on first launch and persists the list to `~/.config/specialists/console.json`. Subsequent launches reload the saved list for instant startup. `--add-repo <path>` and `--remove-repo <name>` CLI flags manage the list without opening the TUI.
- **`RepoConfigView` — interactive repo registry management inside the console (PR #142).** `R` from `ps` opens an in-TUI editor for `console.json`: `+` add a repo (path → name two-step), `d` remove, `e` edit path, `n` edit name, `r` rescan (depth-2 inline), `s` toggle inactive rows. All mutations share the same `RuntimeClient` persistence surface as the CLI flags.
- **DiffView SHA fallback for dead-worktree jobs (`unitAI-ctb4u.29`, PR #135).** When a job's worktree has been removed, DiffView falls back to the recorded `git_commit_sha` from `supervisor_status`. The section title changes to `diff summary · @<sha7> (commit)` so operators know they are viewing a historical snapshot rather than a live worktree diff.
- **`sp ps` gets TUI-themed rows and stats line (`unitAI-ugw4s`, PR #144).** The `sp ps` shell command now renders job rows using the same 24-bit ANSI palette, status glyphs, and column-adaptive layout as `sp console`. The stats line (`jobs N/M · running N waiting N · …`) is appended below the table in dim text. Non-TTY output falls back to plain text as before.
- **Snapshot-diff engine ported from gitboard (`unitAI-ctb4u.19`, PR #137).** `src/specialist/snapshot-diff.ts` provides stable SHA-256 hashing of job snapshots (`snapshotHash`) and upsert/tombstone delta computation (`snapshotDiff`). The console poll loop uses the hash to skip no-op dispatches and the delta to expire paint-cache entries for tombstoned jobs only, avoiding full-cache invalidation on every tick.
- **Interactive `waiting_auto_close_ms` global override (`unitAI-pj2mm`, PR #152).** `waiting_auto_close_ms` is now settable via the global `~/.config/specialists/user.json` overlay without editing each package specialist JSON. `sp console`'s ConfigView (`g`) displays the effective default next to `inherit` (e.g. `inherit (120000)`) when no override is active. All 24 package specialist JSONs had their stale `null` placeholder removed (`null` triggered a schema validation error at dispatch; field is `number | undefined`).
- **`quant-methodologist` and `quant-researcher` specialists (NEW, package tier).** Two new quant-focused READ_ONLY specialists ship at `config/specialists/` (v1.0.0). `quant-methodologist` audits and designs quantitative analytics methodology/pipelines for market-data systems — formulas, units, conventions, numerical probes, model assumptions, and creative-but-conservative pipeline proposals (`thinking_level: high`, LOW read/probe, no implementation edits). `quant-researcher` gathers source-backed evidence for mathematical finance, market microstructure, econometrics, exchange/product conventions, academic papers, package semantics, DeepWiki repo scans, and GitHub implementation snippets (LOW research, no local code edits). Both ship with `model = null` / `fallback_model = null` resolved via the KAN-90 global config layer (commit `78e0b53b`).
- **KAN-91 expanded global overrides.** Phase 0 adds the nested execution and prompt override machinery that keeps loader allowlists and `user.json` schema in sync.
- **KAN-91 user-environment overrides.** Phase 1 allowlists `prompt.system_prompt_mode`, per-specialist Serena/GitNexus extension opt-outs, `notes_mode`, `output_file`, and prompt/stdout byte limits in the global `user.json` layer.
- **KAN-91 fallback model chains.** Phase 2 adds `execution.fallback_models` arrays, keeps legacy `fallback_model`, and walks fallback chains only on transient provider failures.
- **KAN-91 preset references.** Phase 3 adds `@preset/<name>` model and fallback references with package preset lookup, depth/cycle guards, telemetry, and type validation.
- **KAN-91 global override upgrade notes.** `sp init --global` now writes a `_doc` sentinel in strict JSON and points users to `docs/upgrade-notes/kan-91-expanded-overrides.md` for field semantics.
- **Console-safe AgentOps operations surfaces.** `sp serve` now exposes read-only per-job normalized forensic streams at `GET /jobs/:job_id/feed-events` and `/api/specialists/jobs/:job_id/feed-events`; Prometheus projection adds bounded `xtrm_chains_total` / `xtrm_chain_duration_seconds`, projects gate verdict and evidence-ref counters, forbids raw diff labels, keeps chain/job/file/diff drill-down in forensic events, and documents the console-facing telemetry contract updates (`unitAI-5ljfu`).
- **AgentOps correlation and MCP telemetry pre-wiring.** Forensic events now carry optional `session_id`, `conversation_id`, `trace_id`, `span_id`, and `parent_span_id` correlation fields through Pi session metadata, supervisor status, SQLite forensic writes, and `sp feed`/`sp log` JSON surfaces. MCP timeline events normalize to canonical `mcp.*` names, preserve MCP/JSON-RPC/trace identifiers as correlation/body data only, and project bounded `xtrm_mcp_operations_total` metrics without implying a live MCP emitter (`unitAI-eoqxp.3.1`, `unitAI-eoqxp.3.2`).
- **Telemetry contract validation and token-first cost semantics.** Forbidden Prometheus labels now include session/conversation/MCP/JSON-RPC/eval/policy/identity correlation IDs, AgentOps catalog fixtures cover job/MCP/identity/policy/eval/service-skills/pulse/token provenance examples, and the telemetry docs explicitly keep USD cost out of runtime metrics until billing/pricing provenance exists (`unitAI-eoqxp.3.5`, `unitAI-v1fzu`).
- **AgentOps forensic telemetry bridge — `xtrm.forensic.v1` runtime envelopes, persistence, and query surface.** Specialist runtime events now dual-write canonical forensic envelopes into `specialist_forensic_events`, with deterministic redaction before persistence/output and additive `forensic_event` payloads on `sp feed --json` / `sp log --json` while preserving legacy fields. New `sp forensic <job-id> --json` emits persisted NDJSON evidence for a job; real-job smoke `ddc421` validated 68 events across `job`, `model`, `turn`, `tool`, and `git` families (`unitAI-60w93.2`, `.3`, `.4`, `.8`, `.9`, `.10`, `.14`, `unitAI-z2s17`).
- **AgentOps Prometheus projection — `sp metrics --prometheus` plus `sp serve` `GET /metrics`.** Specialists now exports low-cardinality Prometheus/OpenMetrics text for job state, job totals, duration/wait histograms, turns, context usage, tool calls, LLM tokens, queue depth, process/worktree gauges, and projection timestamp. The projection is table-derived/replay-safe for current state, validates text syntax in CI, and keeps high-cardinality IDs (`job_id`, `chain_id`, `participant_id`) out of labels (`unitAI-60w93.5`, `.6`, `.7`, `.11`, `.12`, `.13`).
- **AgentOps telemetry readiness smoke for gitboard handoff (`unitAI-ub65d.4`, PR #114).** Closes the `unitAI-ub65d` epic by validating the shipped telemetry meets the gitboard materializer handoff contract: forensic stream carries normalized `xtrm.forensic.v1` rows with `body` + `redaction`, job metrics carry turns/tools/model + token split + `usage_source`, evidence includes verdict/result and diff/commit refs where present, and `sp metrics --prometheus` stays bounded.
- **`sp setup` CLI verb + benchmark data module (Epic `unitAI-t86wh`, PRs #119, #120).** New top-level `sp setup` verb composes `sp init --global` / `sp edit --global` / `sp doctor --specialists` into a benchmark-driven model-assignment workflow: `--discovery [--json]`, `--fetch-benchmarks [--json]`, `--plan <budget-preset>`, `--apply`, and `--probe-only`. Backed by `src/specialist/benchmarks.ts` (PR #119) — a pinned SSOT snapshot from `artificialanalysis.ai` (primary) + `lmarena.ai` (secondary) plus an agentic-followthrough probe suite that catches model failure modes public leaderboards miss.
- **`sp list` / `specialists list` — per-specialist version badge, package-version header, and new-release alert.** Each row now renders the spec's own `metadata.version` as a `[vX.Y.Z]` badge after the name (e.g. `seconder [v1.0.0]`); the header line shows the running package version (`Specialists (N)  specialists v<pkg>`); and when the existing version-check finds a newer published tag, `sp list` prints `new version <v> available, run npm i -g @jaggerxtrm/specialists@<v>`. Rows are sorted alphabetically by name (human output and `--json`, ordering-only — `--json` stays a top-level array, backward-compatible). Reuses `getVersionCheckResult()` (TTY-gated, 6h cache, 2s timeout, silent on failure) via a new `formatListVersionAlert()` — no new network/cache path (`unitAI-k5vx7`).

### Changed
- **Per-repo `SourceQueue` for poll isolation (`unitAI-ctb4u.20`, PR #138).** Each repo now gets its own `SourceQueue` (1 500ms coalesce) instead of a shared `setInterval`. Tab-switching cancels the prior repo's pending dispatch immediately; no stale poll from the previous repo can race the destination repo's first render.
- **Per-row paint cache in `ProcessView` (`unitAI-ctb4u.21`, PR #139).** Rendered job-row strings are cached by composite key `jobId|status|ctxBucket|width|depth|selected|datePrefix`. A poll tick with unchanged rows skips all `renderJobRow` calls. Cache is bounded to `totalJobs × 2` and is cleared on repo switch and tombstone delivery, preventing cross-repo bleed and unbounded growth in long sessions.
- **Dependency-bump CI policy adoption (`unitAI-c7zdy`, PR #154).** OSV PR scans are now advisory by default but fail on SECURITY_FORCED findings, while push/schedule scans remain hard gates. `package-payload` separates install/build/pack/assert steps so harness failures no longer masquerade as payload-contract failures. Added a dry-run-first dependency verdict materializer for advisor/followup/gate substrate artifacts.
- **Specialist model selection moves to a per-user global config (KAN-90 / `unitAI-1gtou`).** Every `config/specialists/*.specialist.json` now ships with `execution.model = null` and `execution.fallback_model = null`. The `SpecialistLoader` resolves each specialist via a 3-layer field-merge (`package canonical → ~/.config/specialists/user.json → .specialists/user`); the legacy `.specialists/default/` mirror was retired (commit `31a6421c`) and stale entries are pruned by `drift-detector` / `sp prune-stale-defaults`. New CLI surface: `sp init --global`, `sp edit --global`, `sp doctor --specialists`. Missing models after merge raise `SpecialistMissingModelError` at dispatch with a pointer to `sp edit --global`. Blocked fields (`execution.permission_required`, `mandatory_rules`, `capabilities`, `output_schema`, `auto_commit`, `prompt.system`, `skills.scripts`) are stripped from the global layer and surfaced via `sp doctor --specialists`. Upgrade guide: `docs/upgrade-notes/kan-90-global-user-config.md`. (Commits `5f8d725e`, `6604c144`, `6b69a6fe`, plus this commit.)
- **`setup-specialists` skill v1.0 → v2.0 + `specialists-creator` skill v1.3 → v1.4 — KAN-90/91 global-config workflow (`unitAI-vme0p`).** `setup-specialists` is fully rewritten (162 → 261 LOC) to teach the 3-layer field merge, the `sp init --global` / `sp edit --global` / `sp doctor --specialists` workflow, the `OVERRIDE_ALLOWED_*` allowlist (model + fallback chains + thinking_level + byte limits + extension opt-out + `notes_mode` + `output_file` + `system_prompt_mode`), `@preset/<cheap|medium|power>` references, and operator pitfalls (positional-form vim fallthrough, `thinking_level: off` breaking thinking-class models, repo-override shadowing global). The previous v1.0 literally claimed "There is no supported global override layer yet" — false since KAN-90 shipped on 2026-06-13. `specialists-creator` gains an additive `## Global User Override Layer (KAN-90/91)` section (+118 LOC) that mirrors the per-spec field reference to the global-layer dot-path syntax, so authors of a new specialist can document the same fields once and have them work in both layers. Operators landing in a fresh `@jaggerxtrm/specialists` install via `/setup-specialists` or `/specialists-creator` now read the current truth instead of the stale claim.
- **`setup-specialists` skill v3.0 interactive playbook — phase contracts + interactive checkpoints (`unitAI-hdrr6`, PR #121).** Rewrites `setup-specialists` into a directed 5-phase flow: `sp setup --discovery`, `sp setup --fetch-benchmarks --json`, five explicit `AskUserQuestion` checkpoints (budget/provider/auth/privacy/probe shape), deterministic `sp setup --plan` output/table proposal review, and `sp setup --apply` verification with optional `sp setup --probe-only` flow. Adds strict parse contracts for `pi --list-models`, `sp doctor --specialists`, `sp list --full`, and benchmark JSON so multiple orchestrators can produce identical state and proposals.
- **`sp script` trusted-mode hardening + script-specialist observability (`unitAI-4zask`/`unitAI-mally`/`unitAI-q5t29`, PR #145).** Finishes the `service-skills-sync` script-specialist refit: strict JSON machine-output handling with prose + fenced-JSON recovery for the final wrapper path, live script-specialist observability rows/events surfaced in `sp ps` / `sp feed`, and hardened trusted script mode so dangerous local-script / write-capable execution is explicit rather than implicit.
- **`service-skills-sync` specialist v1.4.0 — mandatory Phase 2.5 diff content scan for non-symbol drift.** Adds a `git diff <last_sync_ref>..HEAD` scan step between Serena cross-check and classify, grepping for renamed env vars, new/removed exception sites, error log strings, docker container/image renames, and new API endpoints (6 patterns). The `audited-and-unchanged` verdict now requires a clean diff scan in addition to a gitnexus cosmetic signal. Missing `last_sync_ref` emits a new `⚠ Triage-incomplete` verdict rather than silently passing. New `service-skills-diff-scan-mandatory` mandatory rule enforces the contract. Motivated by `py_backend-0ondo` (darth-feedor) where string-literal-only drift was mislabeled as semantic-unchanged (`unitAI-ekt17`).
- **`test-runner` specialist — `task_template` aligns with exact-command-wins scope semantics.** Pinned exact commands from the orchestrator/test-engineer now explicitly win over manifest-detected fallback (fallback is clearly labelled as evidence, never a scope override) (`v2.0.0 → v2.0.1`, PR #102).

### Fixed
- **pi-coding-agent ownership/package references corrected (`unitAI-fgpxv`).** README, bootstrap/service docs, and `sp init` optional prerequisite hints now point to `earendil-works` (`https://github.com/earendil-works/pi-coding-agent`, `@earendil-works/pi-coding-agent`) instead of stale xtrm/Jaggerxtrm or mariozechner references.
- **Defensive render against malformed `status_json` rows (`unitAI-ctb4u.27`, PR #126).** Per-row `try/catch` in `renderProcessRows` prevents a single corrupt `status_json` entry from crashing the entire ProcessView paint loop; malformed rows render as `?? <malformed row dropped>` without disrupting adjacent rows.
- **Generic `↑↓` keys gated to `ps`/scroll views only (`unitAI-ctb4u.30`, PR #127).** The generic `move` reducer action was consuming arrow keys even in `config` and `diff` views, which have their own cursor handlers. The gate prevents it from swallowing keys before view-specific handlers can win.
- **`ConfigView` hint text enriched with operational guidance (`unitAI-ctb4u.31`, PR #128).** Each editable field's `allowedHint` now includes concrete examples and constraint descriptions so operators understand valid values without leaving the TUI.
- **Scroll and `selectedRow` reset on back-from-detail (`unitAI-kz1ud`, PR #129).** Navigating back from feed/result/inspect/bead/diff to `ps` previously retained the scroll position from the detail view, leaving the cursor off-screen. The `back` action now resets both `scroll` and `selectedRow` to 0.
- **Forensic feed `TYPE_W` column widened to 32 (`unitAI-3wm6x`, PR #130).** The type column in feed-event rows was truncated to 16 characters, cutting off longer forensic event type names such as `xtrm.forensic.v1.*`.
- **`stderr` writes consolidated through `log.ts` single-sink (`unitAI-21sn4`, PR #131).** Four separate `process.stderr.write` call-sites in `runtime.ts` bypassed the structured `logError` sink, preventing log-level filtering and test interception.
- **`sp console --help` updated to v2 keybindings with parity guard (`unitAI-ctb4u.23`, PR #132).** The help text now matches the live keymap; a compile-time parity check ensures the help string and `handleInput` handlers cannot silently diverge.
- **Global-config writes use atomic `tmp + rename` (`unitAI-ctb4u.17`, PR #133).** Direct overwrite of `user.json` was susceptible to torn reads on interrupted writes. Writes now go to `user.json.tmp` followed by `fs.renameSync` — atomic on POSIX.
- **`ps` default `historyMode` aligned with `sp ps` shell default (`unitAI-ctb4u.26`, PR #134).** `sp console` opened in `history` mode (all jobs) while `sp ps` defaulted to `default` (running + recent only). Both now default to `default`; `h` in the console cycles through modes as before.
- **`supervisor.dispose()` now reaps the pi/Serena session (`unitAI-pjst5`, PR #150).** `dispose()` previously closed sqlite/tmux/FIFO only and never explicitly stopped the Serena extension subprocess attached via `script-runner.ts:977-979`. After worktree removal, Serena LSPs survived indefinitely and could accumulate across long-running sessions until the host exhausted memory. The supervisor finalizer now reaps the extension subprocess group explicitly. Complementary to upstream `@jaggerxtrm/pi-extensions` PR #306 (KAN-110-A `resolveSessionCwd` — eliminates the duplicate-daemon race that was the other source of orphans); together the two close the orphaned-Serena class.
- **`observability.db` no longer leaves a zero-byte placeholder when bootstrap fails (`unitAI-nuh7l`, PR #151).** Previous behavior: when `sqlite_open` failed during runtime startup the path was left as a 0-byte file with the open error silently swallowed; subsequent invocations short-circuited on the empty file and never re-tried bootstrap, blocking forensic event capture for the affected jobs. Open failures are now surfaced explicitly so the orchestrator/operator can diagnose, and the bootstrap path no longer creates the placeholder.
- **`sp edit --global <name.field> <value>` now applies the value instead of falling through to vim (`unitAI-61h1b`, PR #123).** `parseArgs` no longer consumes the first positional as the specialist name when `--global` is active, so the documented positional form works without `--set`. In addition, bare `sp edit --global` (no path) now fails fast with a script-friendly hint (`specialists edit --global --set <name>.<field.path> <value>`) when stdin is not a TTY — prior behavior was to spawn `$EDITOR` and hang indefinitely in non-TTY contexts (scripts, hooks).
- **`sp script` JSON recovery from streamed assistant text (PR #146).** When `PiAgentSession.getLastOutput()` leaked raw tool-call markup (`<|tool_calls_section_begin|> …`), trusted local `sp script` runs (e.g. `service-skills-sync`) failed with `invalid_json`. The final-wrapper recovery path now prefers the last completed streamed assistant message as a cleaner source before falling back to the one-turn JSON repair flow. Adds a focused regression test for the real failure mode and rebuilds dist.
- **Live smoke harness architectural improvements (`unitAI-o5rwj`, PR #124).** New `tests/integration/cli/live-smoke.helpers.ts` (`createLiveSmokeHome` scopes specialist overrides via `XDG_CONFIG_HOME` while preserving real `HOME` so `~/.pi` credentials resolve; `snapshotJobIds` + `waitForNewJobId` provide filesystem-based job-id discovery when stdout is empty) and a `.beads` symlink so `sp run` dispatched from a temp repo can resolve beads created in the repo root. Improves test isolation and unblocks KAN-91 live smoke.

### Security
- **`esbuild` pinned to `^0.28.1` to clear GHSA-gv7w-rqvm-qjhr (`unitAI-mtghu`, PR #118).** Clears the CVSS 8.1 High advisory (GHSA-gv7w-rqvm-qjhr) and the CVSS 2.5 Low advisory (GHSA-g7r4-m6w7-qqqr) on esbuild ≤ 0.28.0, which were failing OSV scan on every PR. esbuild is transitive (via `tsx@4.22.3` and `vite`); a single `package.json` override resolves both ranges.
- **`hono` bumped to 4.12.26 and `vite` pinned to 8.0.16 (devDependency) for OSV cleanup (PR #149).** Clears residual OSV findings; `vite` is moved back to `devDependencies` after a `bun update` had promoted it into runtime deps, and `bun.lock` regenerated.

## [v3.17.0] — 2026-05-31

### Added
- **`seconder` specialist (NEW, package tier).** The fused post-writer gate from canon `docs/design/chain-templates.md` §2.3 — collapses the old split between scope/compliance (reviewer phase-1) and code-quality smell (`code-sanity`) into one READ_ONLY dispatch (`openai-codex/gpt-5.4-mini`) emitting a structured dual-verdict JSON: `scope_verdict` + `scope_findings` + `quality_verdict` + `quality_findings` + `overall_verdict`. The chain reducer reads `overall_verdict` to advance or route back to the writer; the reviewer reads the dimension-tagged findings. Replaces `code-sanity`, which is **removed** this release (see Removed) (`unitAI-4e194`, `unitAI-wz2ag`, `unitAI-321ir`).
- **`test-engineer` specialist (NEW, package tier).** Post-implementation behavioral-test author from the actual diff (canon §2.5). MEDIUM, `openai-codex/gpt-5.5`, `requires_worktree`. Produces tests + fixtures + smoke/E2E harnesses + telemetry assertions and emits exact `test-runner` commands via a structured schema (`status`, `files_changed`, `coverage_map`, `smoke_e2e_commands`, `telemetry_assertions`, `test_runner_commands`, `known_deferred_paths`, `source_bug_suspicions`). Ambidextrous role (§3.16): the same spec is the **primary writer** in `test-only` chains and the **secondary writer** in `code-with-tests` chains — the system prompt is mode-agnostic and the position arrives via the dispatch-time mandate. Forbidden from patching production source by default (`unitAI-sfwe1`, `unitAI-sfwe1.1`).
- **Two NEW chain-template formulas — `code-with-tests` (§3.14) and `test-only` (§3.15).** `code-with-tests`: dual-writer production chain (`executor` writes the diff, `test-engineer` writes tests against it) at high/critical scrutiny. `test-only`: single-writer chain when scope is test-paths only (`test-engineer` as primary writer). Both carry the ambidextrous `test-engineer` mandate in the step `description` (pre-substrate position-injection mechanism, §3.16) (`unitAI-f9kku`).
- **Seconder dual-verdict eval + QA-routing eval.** `.specialists/evals/seconder/` — a reproducible static eval with three fixtures (wrong-scope → `scope_verdict` FAIL, bad-quality → `quality_verdict` FAIL, clean → `overall_verdict` PASS) each carrying an `expected-verdict.json`, plus an operator-run `run.sh` and a token-cost note (`unitAI-o7j1a`). `config/skills/using-specialists-v3/evals/` gained four QA-routing eval cases (test-engineer primary vs secondary writer, test-runner owner-routing, reviewer-consumes-QA-evidence) + a passing vitest harness (`unitAI-sfwe1.5`).
- **`transcriber` specialist (NEW, package tier).** Promotes the documentation-grade YouTube transcriber prompt to the shipped package catalog at `config/specialists/transcriber.specialist.json`. v1.6.0 uses `openai-codex/gpt-5.3-codex`, title-derived transcript/analysis filenames, narrow subtitle language extraction to avoid YouTube 429 fanout, immediate section-by-section writes, dense technical `DETAILED SECTION ANALYSIS`, `TECHNICAL EXTRACTION TABLES`, and a coverage/quality audit to prevent shallow “2-line per 5 minutes” outputs (`unitAI-jfw26`).
- **`sp log` runtime/provenance stream** — new operator-facing log command for specialist runtime debugging. It reads `observability.db`, shows dispatch/control/status/error/auto-commit provenance separate from `sp feed`, supports `--json` NDJSON for full payloads, `--follow`, `--since`, `--limit`, job/bead/specialist/node filters, and `--all-events` for raw feed-like internals (`unitAI-gqpvw`, `unitAI-vfqgq`).
- **`sp log` parent-directory/global mode** — when run outside a repo root with no local specialists DB, `sp log` discovers immediate child repos containing `.specialists/db/observability.db` and aggregates their runtime rows as one global log; `--repo <name>` narrows output to a single child repo (`unitAI-v5xfu`).
- **`obligations-scanner` specialist** (NEW) — READ_ONLY, cheap (`openai-codex/gpt-5.4-mini`, `bare: true`, ~30s target) pre-review marker scan. Scans executor/debugger diffs for newly-introduced `TODO`/`FIXME`/`HACK`/`XXX`/`TEMP`/`WIP`/`NOTE(release)` markers in production code. Distinguishes production vs test/fixture surfaces. Recognizes structured `// TODO(<bead-id>): reason` format and treats it as TRACKED when the linked bead is open. Verdict: `CLEAN | OBLIGATIONS_FOUND | BLOCKED` with a JSON `output_schema` the reviewer consumes directly. Iron-style obligations tracking (`unitAI-kglvm.3`).
- **`docs/design/iron-review-hardening.html`** — design doc visualizing the new pipeline (SCRUTINY taxonomy, old-vs-new chain flow, per-specialist changes, git-state precondition, manual execution plan). Mirrored to `~/second-mind/1-projects/Mercury/` for sync (`unitAI-fpwbr`, `unitAI-1n56e`, `unitAI-ejdi1`).
- **`service-skills-sync` specialist (NEW, package tier).** Promotes the Service Skills Librarian (previously a market-data user-tier override) to a shipped package specialist at `config/specialists/service-skills-sync.specialist.json`. MEDIUM, `openai-codex/gpt-5.4-mini`; keeps per-service expert-persona `SKILL.md` docs in sync with code drift using gitnexus (`detect_changes`/`impact`/`context`) + Serena, gated by a `drift_detector.py` pre-scan. The per-service knowledge layer the future devops agent reads (DevOps PRD §7.1) (`unitAI-g8zr3`).
- **`researcher` specialist v1.2.0 → v1.3.0 — general-web pipeline (Mode 4).** Adds a fourth research mode closing the web-research gap (previously the researcher reached library docs/repos/code/social but had no general web search or arbitrary-URL read): `ddgs` (DuckDuckGo search CLI, no API key — `uv tool install ddgs`) discovers authoritative URLs, then `agent-browser` (native Rust CLI + Chrome daemon — `npm i -g agent-browser`) reads any URL including JS-rendered pages. Documented in `prompt.system` Mode 4 + `config/mandatory-rules/research-tool-routing.md`. `capabilities.external_commands` deliberately left empty — it is a hard pre-run gate (`runner.ts validateBeforeRun` throws on a missing PATH binary), so declaring these heavy tools would break the shipped researcher in projects without them; documented as available-on-demand with install hints instead (`unitAI-qgvld`).
- **`notes_mode` specialist field + markdown-native 3-state handoff.** New top-level `notes_mode` enum (`full-trail` default | `final-only`) controls how each turn's handoff is persisted to BOTH the input bead notes and `output_file`. The supervisor renders a markdown-native 3-state handoff — `### <specialist> · <model> · [turn N · WAITING]` trail blocks plus a canonical `## <specialist> · <model> · [FINAL · DONE]` block — with the specialist's output verbatim, a single italic metadata footer (empty/zero/unknown fields omitted), and a provider-prefix-stripped model string; no divider rules or emoji. One shared content source feeds bead notes, `output_file`, and `sp result`. `final-only` persists only the canonical FINAL block and overwrites `output_file`, for non-coding/chained pipelines where the next specialist reads the previous one's note or file as input (`unitAI-10y07`, `unitAI-yiazs`).

### Changed
- **`test-runner` specialist — upgraded to the QA failure-routing contract (canon §2.5).** Now prefers exact commands from `test-engineer`/orchestrator and falls back to manifest-detected runners only when none are supplied (clearly labeled as fallback). Classifies every failure by owner — `test_engineer` (test/fixture/harness wrong, or new untested feature), `debugger_or_executor` (missing telemetry / source behavior regression), `infrastructure`, `pre_existing` — and never writes tests or patches source (LOW). Backed by `config/mandatory-rules/test-runner-execution-scope.md` (`unitAI-sfwe1.2`).
- **`reviewer` specialist — refactored to phase-2-only (seconder fusion, canon §2.3).** The phase-1 compliance/scope check now lives in `seconder`'s `scope_verdict`; the reviewer keeps only phase-2 (adversarial deep code-quality audit + machine-readable Release Checklist + ddiff re-review on PARTIAL) and treats a `seconder` PASS as the upstream scope gate. Two-phase framing removed from the prompt (`unitAI-4e194`, `unitAI-sowpa`).
- **13 chain-template formulas rewired for the canonical QA pipeline.** Every production-diff template (`code-standard`, `code-with-advisors`, `debug`, `security-deep`, `restitch`) now wires `writer → seconder → test-engineer → test-runner → [security-auditor if sensitive] → obligations-scanner → reviewer` (canon §2.1) — `code-sanity` renamed to `seconder`, `test-engineer` + `test-runner` inserted. README overlay table + roadmap Opp 14/15 status updated (`unitAI-f9kku`).
- **`using-specialists-v3` skill — canonical seconder-fusion pipeline.** SKILL.md now teaches `writer → seconder → test-engineer → test-runner → [security] → obligations → reviewer`, the QA failure-routing matrix (§2.5), and SCRUTINY reframed as a **chain property that modulates structure, not quality** (§2.2) — including the `none` tier for read-only chains and the required-at-creation rule. `seconder` replaces the `code-sanity` seconder slot; reviewer documented as phase-2-only (`unitAI-096re`, folds `unitAI-sfwe1.3`).
- **`sp log` human output is leaner and calmer.** Default output now hides agent-internal turn/tool/text/thinking/token rows already covered by `sp feed`, keeps runtime-owned rows only, collapses repo/path/branch/worktree metadata into one compact `worktree=<repo>/<worktree>` field, uses a restrained professional color palette (dim metadata, plain job ids, bold specialist names, color-coded `status=<state>`, green/yellow/red/cyan only for semantic state), and collapses adjacent duplicate display rows caused by duplicated runtime events while preserving full payloads in `--json` (`unitAI-vfqgq`, `unitAI-npjlq`, `unitAI-f5k0p`).
- **`reviewer` specialist — Iron-inspired prompt overhaul.** Five new system-prompt sections, additions only (existing source-of-truth priority and AUTHORITATIVE REVIEW CONTEXT preserved verbatim) (`unitAI-kglvm.1`):
  - **SCRUTINY tier behavior** (`low | medium | high | critical`) — reads field from bead contract; defaults to `medium`; tiers reviewer depth from seconder-only spot-check (low) through file-by-file sign-off with mandatory `gitnexus_impact` (high) to required second-opinion (critical).
  - **Scrutiny auto-escalation** — surface-pattern floor table raises level regardless of bead's stated SCRUTINY when diff touches `auth/*`, `**/credentials*`, `**/token*` (→ high), `config/specialists/*.json` (→ high), `src/specialist/{runner,schema}.ts` (→ high), `**/*.lock` (→ medium + security-auditor required), `migrations/**` (→ high), `src/permissions/*` / `hooks/**` (→ critical). Author's level is a floor, not a ceiling.
  - **Re-review after PARTIAL (Ddiff mode)** — when re-reviewing a fixed PARTIAL, scope to delta since prior verdict, carry forward prior approvals, audit only newly-touched files/symbols.
  - **Obligations scan** — consumes `obligations-scanner` JSON output if present, else scans diff inline; production markers → PARTIAL unless accepted via bead `NON_GOALS` or structured `// TODO(<bead-id>):` reference; test/fixture markers noted but not blocking.
  - **Release Checklist** (REQUIRED) — machine-readable block appended to every verdict for future `sp merge` enforcement.
- **`executor` and `debugger` specialists — Obligations discipline.** New system-prompt section instructs both codegen specialists to avoid introducing in-code obligation markers in production paths by default; if work is genuinely deferred, file a follow-up bead via `bd create --deps discovered-from:<current>`; if a marker is truly needed at a code site, use structured form `// TODO(<follow-up-bead-id>): <reason>` where the linked bead is open and listed in current bead's `NON_GOALS`. Prevents PARTIAL fix-loops from the new obligations-scanner gate. Test/fixture paths exempt (`unitAI-kglvm.4`).
- **`using-specialists-v3` skill: v3.4 → v3.5 (Iron-style orchestration).** Substantial restructure aligned with the above specialist changes (`unitAI-kglvm.5`):
  - "Advisory Passes" section reframed as three mandatory gates: **Seconder Gate** (`code-sanity`), **Security Gate** (`security-auditor` on sensitive surfaces), **Obligations Gate** (`obligations-scanner`). Skip rules tightened.
  - NEW **SCRUTINY taxonomy** section: tier behavior + auto-escalation surface table. SCRUTINY field added to task/epic, executor, reviewer bead contract templates.
  - NEW **Git State Precondition** section: four-check pre-flight (working tree clean, HEAD contains prior chain commits, no orphaned worktrees, in-sync integration branch) required before dispatching any chain that depends on prior chain output. Strictness-by-scenario table.
  - **Rule #9 INVERTED**: manual git workflow is now canonical; `sp merge` and `sp epic merge` are PROHIBITED (known broken, awaiting separate rework epic). Cherry-Pick Playbook promoted to canonical multi-chain merge path. `sp finalize` removed from documented orchestrator workflow.
  - **Rule #13 exception clause** added for epics that restructure the specialists themselves (operator-authorized manual-orchestrator-direct work).
  - **Rule #14 NEW**: Git State Precondition reference.
  - `obligations-scanner` row added to Choosing The Specialist table. `parallel-review` marked deprecated.
  - Escalation Matrix and Failure Recovery tables rewritten: sp-merge rows replaced with git-workflow recovery patterns (stale `.git/index.lock`, `info/exclude` vs tracked beads file, FF-via-`git update-ref` when checkout blocked).
- **CLAUDE.md "Common gotchas" section rewritten** to match the new canonical: manual merge, explicit `sp stop` for keep-alive cleanup, Iron-style gates mandatory, Git State Precondition, bd auto-export churn handling, package-tier specialist edits via direct JSON.
- **`bd` auto-export pain fix.** `bd config set export.git-add false` disables per-write auto-staging of `.beads/issues.jsonl` (silent mid-work; no checkout aborts; no `.git/index.lock` races). Paired with a custom block added to `.git/hooks/pre-commit` AFTER bd's managed markers — runs `git add -f .beads/issues.jsonl` so commits naturally include the fresh JSONL snapshot via the existing pre-commit hook chain. Eliminates the runaway `chore(beads): export state` commits that plagued every multi-bd-op session. Verified end-to-end in this repo (commits `63ac83f6`, `4c1f19a5`, `1e014f33`) (`unitAI-mg18o`).
- **`output_file` decoupled from `SPECIALISTS_JOB_FILE_OUTPUT`.** A specialist that sets `output_file` now always writes its full result — foreground and `--background` (tmux) — independent of the env flag, which now only gates the debug file-mirrors (`events.jsonl` / `status.json` / `result.txt`). Previously `--background` (tmux) runs silently dropped `output_file` because the env var did not propagate into the tmux session. The single-writer invariant is preserved (the supervisor owns the file in supervised runs; `suppressRunnerFileOutput` still skips the runner write), and `.specialists/*-result.md` was added to `.gitignore` since specs with `output_file` now always write. `output_file`, `notes_mode`, and the handoff envelope are documented in `docs/authoring.md` and the `specialists-creator` skill (`unitAI-f58ma`, `unitAI-g8rqg`).

### Removed
- **`code-sanity` specialist removed — superseded by `seconder`.** The Iron seconder gate (briefly promoted as `code-sanity` mid-cycle, `unitAI-kglvm.2`) is replaced by the new `seconder` specialist, which fuses its code-quality smell pass with the reviewer's old phase-1 scope check into one dual-verdict gate (canon §2.3). `config/specialists/code-sanity.specialist.json` deleted; all operational references across the v3/auto/v2 skills, `reviewer.specialist.json`, chain-template formula prose, and `docs/specialists-catalog.md` renamed to `seconder`. Two historical lineage notes preserved (`seconder.specialist.json`'s absorbed-mandate section + the v3 SKILL §2.3 fusion explanation) (`unitAI-321ir`, `unitAI-4e194`).
- `sp merge` / `sp epic merge` / `sp finalize` removed from documented orchestrator workflow in `using-specialists-v3`. Commands still exist in the `sp` binary (no source-code removal) but the skill explicitly prohibits their use pending a separate rework epic. Operators reaching for them should use the documented manual git workflow instead.

### Changed (prior)
- All 17 package-shipped specialists in `config/specialists/` now declare the v3.16.0 schema additions explicitly: `execution.bare: false` and `prompt.system_prompt_mode: "append"`. Values match the previous absent-field defaults — pure-mechanical, zero behavior change — but every shipped spec is now self-documenting at the schema level instead of relying on per-runner legacy fallbacks. `bare.specialist.json` retains its explicit `bare: true` + `replace` (`unitAI-51r2w`).

### Fixed
- **`seconder --job` now receives the writer diff.** Reused worktree dispatches populate the existing `$writer_diff` template variable from the same bounded branch/staged/unstaged diff source used by reviewer diff injection, so seconder can make concrete scope/quality verdicts without orchestrator-pasted evidence (`unitAI-bycl3`).
- `sp stop` / `sp resume` control-plane actions now treat observability writes as best-effort: status/control telemetry failures no longer prevent SIGTERM delivery or falsely report a delivered resume as a steer-pipe write failure (`unitAI-dkhi3`).
- OSV scan now resolves `GHSA-q8mj-m7cp-5q26` by overriding all `qs` lockfile entries to `6.15.2`; `bun.lock` no longer contains vulnerable `qs@6.15.1` entries (`unitAI-dkhi3`).
- Supervisor status reads now reconcile dead `starting`/`running` specialist jobs to terminal `error` with a `run_complete(ERROR)` event, so reviewer crashes during heavy bash validation no longer leave `sp ps`/`sp result` stuck on stale `running` rows (`unitAI-6x6p6`, `unitAI-uzyut`).
- **Per-turn handoff notes now append instead of replace.** `appendBeadNote` called `bd update --notes` (whole-field replace), so each per-turn specialist handoff clobbered the previous one — multi-turn jobs left only the last (often empty) note on the bead, recoverable only from `observability.db`. Switched to `bd update --append-notes` and exported `formatBeadNotes`. (The appended handoff format was subsequently finalized to the markdown-native 3-state form — see the `notes_mode` entry under Added.) Tests in `bead-notes.test.ts` + new `supervisor-bead-notes.test.ts` (sibling, since `supervisor.test.ts` is excluded from the default run) (`unitAI-sx5qk`).
- **`[FINAL · DONE]` handoff block now emitted on `sp stop` for keep-alive jobs.** The canonical FINAL block was silently skipped on the dominant keep-alive→`sp stop` path because `src/specialist/control.ts` constructed the `Supervisor` without a `beadsClient`, so `finalizeWaitingJob`'s `bead_id && beadsClient` guard never fired; `stopJob` also never invoked `finalizeWaitingJob` for `waiting` jobs. Both fixed, and keep-alive turn summaries skip the duplicate non-final done write, so a keep-alive run yields one `[turn N · WAITING]` per turn plus one `[FINAL · DONE]` at stop (`unitAI-mis38`).

## [v3.16.0] — 2026-05-23

### Added
- `sp attach` now opens a chat-style TUI for active specialist jobs, including bare-picker launch and explicit `sp attach <job-id>` attach flows.
- `sp chat` V1 ships as an interactive TUI for active jobs with `@earendil-works/pi-tui`, full keyboard input, and feed parity (`unitAI-u4fdd`).
- `execution.bare` adds zero-runtime-injection package-class specialists plus `bare.specialist.json` template support (`unitAI-rz0cp`).
- `docs/bare-specialists.md` documents bare specialists and package-class runtime behavior (`unitAI-w8t6y`).

### Changed
- `prompt.system_prompt_mode` now supports `append` and `replace` across both runner paths (`unitAI-qngis`).
- `specialists-creator` v1.4.0 adds a Bare specialists section, mandatory_rules layering, and script-class vs package-class runtime split guidance (`unitAI-dp0rw`, `unitAI-w8t6y`).

### Fixed
- Bare `sp attach` now has a real keyboard picker: Up/Down moves the highlighted active job and Enter attaches it.
- Attach targets are limited to active jobs (`running`, `waiting`, `starting`); terminal jobs are hidden from the picker and rejected when requested explicitly.
- Waiting-job attach input now uses live status/fifo data and sends resume/follow-up instead of stale `steer`; duplicate submit guards prevent double-resume busy errors.

### Security
- Pin `idna` above OSV advisory (`f7599a22`).

## [v3.15.4] — 2026-05-21

### Added
- `src/pi/session.ts` pre-spawn `serena-pool` hook: dynamically imports `ensureSerenaForRoot` from the globally installed `@jaggerxtrm/pi-extensions/extensions/serena-pool` (Bun loader) and injects `SERENA_MCP_PORT` into the pi child's `baseEnv` before spawn. `pi-serena-tools` reads the port at construction time and reuses the shared per-repo-root daemon instead of spawning its own on a random port (`unitAI-v0wpf`, `unitAI-ij37x`).
- E2E validation under linked global `sp`: single Serena per worktree on deterministic port, distinct ports across worktrees of the same repo, Serena-disabled specialists confirmed no-op, no random-port duplicate spawns (`unitAI-3gjgh`).

### Changed
- Read-only specialists no longer load Serena: `code-sanity`, `explorer`, `overthinker`, `changelog-drafter` set `execution.extensions.serena=false` and remove the `serena-cheatsheet` template_set where present. Saves ~80–150 MB resident per invocation. Phase 1 of the LSP overhead reduction epic (`unitAI-kg4t9`, `unitAI-c4g0m`).
- `docs/design/conversations.md` absorbs validated patterns from Statecraft / Envoy: explicit authority decision procedure (§10.1) with valid/invalid source lists, `system.epoch_bump` message kind for capability change re-read, `provenance_json` column on `conversation_messages`, read/ack separation invariant (cursor-through-N), authority-lane-per-participant invariant, `cannot_emit` spec field, structured error envelope (§10.2), and capture pattern for >8KB payloads (`unitAI-0p8w3`).

## [v3.15.3] — 2026-05-19

### Changed
- Expanded `using-specialists-v3` guidance with the full `bd dep --type` relationship vocabulary, duplicate/supersede commands, and typed relationship examples woven through existing specialist workflow flows (`unitAI-ylphl.8`).
- Reframed the workflow catalog epic around an executable `sp workflows` CLI/router and propagated the updated skill mirror across xtrm-managed repos (`unitAI-ylphl`).
- Refreshed README and high-traffic docs for v3.14-v3.15 release drift: first-time install/update flow, package-canonical defaults, current specialist catalog, xtrm-tools relationship, service examples, and stale doc links (`unitAI-xvvqb`).

## [v3.15.2] — 2026-05-14

### Fixed
- `sp ps -f` follow mode now behaves like a terminal dashboard instead of a print loop: TTY output uses alternate-screen in-place redraw with cursor restoration and unchanged-frame dedupe, while piped output is ANSI-free append snapshots with EPIPE-safe shutdown (`unitAI-fqo38`).
- `sp run --background` now works correctly again: the tmux wrapper used `/bin/bash -lc` (login shell) which rebuilt PATH from `/etc/profile` only, stripping NVM/bun from PATH and causing `pi` spawn ENOENT. Changed to `/bin/bash -c` so the wrapper inherits the parent process PATH (`unitAI-baz0t`).

## [v3.15.1] — 2026-05-14

### Changed
- `sp prune-stale-defaults` now removes all `.specialists/default/` entries — both byte-identical and diverged — by default, since the entire default tier is drift debt relative to the package-canonical source. Use `--keep-diverged` to retain the old conservative behavior of pruning only redundant (byte-identical) entries (`unitAI-4vuvd`).
- `sp init --sync-defaults` is now deprecated and prints a loud drift-debt warning pointing operators to `sp pin <id>` for intentional version pins. Doctor wording updated to match new `DriftStatus` names (`unitAI-3yys6`).

### Fixed
- `sp list-rules` now includes the package-canonical mandatory-rules tier in its matrix, so a fresh npm install no longer reports 0 rules. The resolver calls `resolveCanonicalAssetDir('mandatory-rules')` as the lowest-priority fallback, matching the actual runner resolution order (`unitAI-5s8df`).

## [v3.15.0] — 2026-05-14

### Added
- `LICENSE` file at repo root — MIT, 2026 copyright `Dawid (Jaggerxtrm)`. Now ships in the npm payload (asserted by the package-payload CI gate). README badge ↔ ship parity restored (`unitAI-3m27y`).
- `package.json` top-level `types` field pointing at `dist/types/lib.d.ts` — TS consumers can now import `@jaggerxtrm/specialists/lib` with type resolution from the root (`unitAI-3m27y`).
- `dist/asset-contract.json` — deterministic, byte-identical-on-regen manifest of every asset specialists ships: `schema_version`, `package_version`, sha256-hashed `shipped_skills` / `shipped_specialists` / `shipped_mandatory_rules` / `shipped_catalogs` / `shipped_nodes` / `shipped_hooks`. Generator at `scripts/generate-asset-contract.mjs` (npm script `generate:contract`). Manifest excludes wall-clock timestamps so xtrm-tools can verify its vendor mirror by sha-comparison instead of a hand-maintained vendor list (`unitAI-cww2s`).
- `.github/workflows/release-gate.yml` — fires on push to master + manual `workflow_dispatch`. paths-filter detects cross-repo asset path changes; regenerates `dist/asset-contract.json` and asserts byte-equality against the committed copy (fails on drift with a clear remediation command); fires `repository_dispatch` to `Jaggerxtrm/xtrm-tools` with `event_type=specialists-asset-validation` and `client_payload` containing the specialists git SHA + tag. Requires `XTRM_TOOLS_DISPATCH_PAT` repo secret (`unitAI-dnqas`).
- `sp merge --target-branch <name>` flag — rebase target override for chains forked from non-`origin/HEAD` branches. Threaded through `parseOptions`, `resolveDefaultBranchName`, `isBranchAlreadyPublished`, `previewBranchMergeDelta`, `rebaseBranchOntoMaster`, `assertBranchMergeWorthiness`, `runMergePlan` in both `sp merge` and `sp epic merge`. Validated via `git rev-parse --verify <branch>^{commit}` before use. Backward-compatible — missing flag preserves current `origin/HEAD` behavior. Retires the xtrm-nr05 cherry-pick playbook for non-main-fork chains (`unitAI-a6e60`).
- `sp clean --reap-orphans` adds a third detection reason: `dead-toolchain`. Surfaces specialist jobs whose PID is alive but `ppid != 1` and which haven't emitted any `tool` or `think` event in the last 30 minutes while status is `running` or `waiting`. Closes the market-data zombie-job pattern (jobs 525851 / 89ab98) where supervisor `stall_timeout_ms` missed the case. Powered by new `ObservabilitySqliteClient.getLastActivityTimestampMs(jobId)` reading `MAX(t) FROM specialist_events WHERE type IN ('tool', 'think')` (`unitAI-wq0mw`).
- `sp list-rules` now shows `.specialists/user/mandatory-rules` as the highest-priority overlay tier in the matrix (matches the runner's actual resolution order). `docs/surface-ownership.md` + `config/mandatory-rules/README.md` synced to document the user-overlay tier alongside specialist user overrides (`unitAI-7ezse`).

- `sp clean --reap-orphans` now also detects stale specialist jobs: dead-pid (DB row in `starting`/`running`/`waiting` whose PID is gone) and orphaned-keep-alive (alive PID with `ppid=1` and `specialists run`/`sp run` cmdline). Both gated by a 30-minute min-age threshold to avoid racing in-progress jobs. Dry-run prints `jobId`, `pid`, `beadId`, `specialist`, `cwd`, `ageMs`, `reason`. Apply mode SIGTERMs alive stale processes and marks the DB row `cancelled` with a `stale-reaper:<reason>` note — observability history preserved (`unitAI-8tm35`).
- `sp feed <job-id>` now replays full DB event history from `observability.db` in seq order for snapshot mode, with `--limit` still capping output and `--follow` unchanged.
- CI workflow `.github/workflows/package-payload.yml` — runs on PRs touching `package.json`, `src/`, `config/`, `dist/`, the assert script, or the workflow itself. Two jobs: `payload-contract` runs `npm pack --dry-run --json` through `scripts/assert-package-payload.sh` against a required asset list (dist entrypoints, `config/specialists/{executor,reviewer}.specialist.json`, `config/mandatory-rules/{executor-delivery,index}`, `config/skills/using-specialists-v3/SKILL.md`, `config/catalog/{index,native,gitnexus,serena}.json`); `packed-smoke` builds, packs, installs the tarball to an isolated `/tmp/sp-smoke-prefix`, and exercises `sp --version` / `doctor --check-drift` / `prune-stale-defaults --dry-run` / `clean --dry-run` / `list --compact` (`unitAI-1j9om` / `unitAI-bf7qw`).
- `scripts/assert-package-payload.sh` — bash helper, `set -euo pipefail`, exits non-zero with explicit missing-asset list when a required path is absent from the dry-run pack JSON.
- New skill `config/skills/using-specialists-auto/` (v1.0) — operator-offline paranoid autonomous orchestration mode for multi-item release runs. Codifies per-role sleep cadence, pre-merge ritual, reviewer rebuttal pattern, dist-rebuild-per-P0 discipline, batch memory-gate close loop, and escalation criteria. Activates on "auto mode", "go", "run autonomously", or similar handover phrasing.
- `sp ps` process-health dashboard — reports Linux `/proc` health above the job dashboard: aggregate specialist process count, Dolt sql-server count, Serena LSP workspaces, orphan count, RSS, CPU, age, MemAvailable thresholds, and JSON `process_health` output. Detailed per-process rows are available via `sp ps --health` (`unitAI-uof0t`).
- `sp clean --ps` soft-clean workflow — hides terminal dashboard history from default `sp ps` with `ps_hidden_at` / `ps_hidden_reason` metadata while preserving SQLite audit history; `sp ps --include-cleaned` and `sp ps --all` restore audit visibility (`unitAI-59nry`).
- `sp clean --reap-orphans` flag — kills leaked dolt/gitnexus/pi processes by walking `/proc`. Matches three orphan classes: `dolt sql-server` whose cwd is under `*/.worktrees/*`, `gitnexus mcp` orphaned to PID 1, `pi`/`pi-coding-agent` orphaned to PID 1. SIGTERM + 1.5s grace + SIGKILL escalation. Linux-only (depends on `/proc`). Combine with `--dry-run` for safe preview (`unitAI-85xxp`).
- `template_field_misuse` error_type returned by `runScriptSpecialist` when `input.template` is the literal name of a key on `spec.prompt` (e.g. `task_template`, `normalize_template`, `system`) instead of a template body — catches the production bug where consumers pass a key name and the service treats it as a 13-char prompt (`unitAI-i6khn`).
- Reference Python client at `clients/python/` — stdlib-only, ~170 LOC, with `pyproject.toml` and live-service smoke tests. Mirrors the closed `error_type` taxonomy 1:1 plus a caller-side `transport` value (`unitAI-huwov`).
- `execution.expected_output_keys: string[]` on script-class specs — triggers a required-keys check independent of `response_format`, so text-format specs that ship a JSON contract inline in `task_template` get `error_type: "invalid_json"` on hallucinated key sets instead of saving corrupt output. Documented in `docs/authoring.md` and `docs/examples/smoke-echo-text-expected-keys.specialist.json` (`unitAI-31kwe`).
- Dockerfile-level `HEALTHCHECK` (node-fetch on `/healthz`, port 8000, 30s interval) — operators inheriting the image get container health reporting for free; explicit compose-level `healthcheck:` is now only needed when overriding the listen port (`unitAI-cnlea`).

### Fixed
- `sp feed -f` (global follow mode, no specific job-id) no longer hangs indefinitely when keep-alive `waiting` jobs remain in the dashboard. `followMerged()` now treats keep-alive `waiting` as terminal-equivalent for exit purposes in global mode. Per-job follow (`sp feed <id> -f`) keeps tracking across `sp resume` turns. `--forever` still overrides for daemon-style usage. Closes GH#76 reported by `Rico1109` (`unitAI-032n4`).
- `sp merge` `bunx tsc --noEmit` post-merge gate no longer false-positives on repos without a `tsconfig.json` (markdown / notes / non-TypeScript projects). `runTypecheckGate` in `src/cli/merge.ts` now checks for tsconfig existence and prints `TypeScript gate: skipped (no tsconfig)` when absent, instead of treating tsc's help-text exit as a merge failure. Closes GH#71 (`unitAI-dpf3a`).
- `sp feed <job-id>` snapshot mode now replays full event history for that job from `observability.db` instead of truncating to the last ~8 events. `queryTimeline` / `readAllJobEvents` use a jobId-scoped DB read path when `filter.jobId` is set (instead of `listStatuses` → filter, which silently dropped events). Reviewers running the documented `sp feed <reviewed_job_id>` audit path now actually see executor's `gitnexus_*` tool events; the previous behavior was the structural cause of the reviewer "missing tool-event evidence" false-PARTIAL pattern that plagued multi-session orchestration. Cleaner `job <id> not found in .specialists/db/observability.db` message replaces the generic `No jobs directory found.` (`unitAI-889dv`).
- `sp merge` `MERGE_DIRTY_IGNORE_PREFIXES` extended with `.beads/` and `.xtrm/skills/active/` — `sp merge` no longer refuses on dirty main when only bd auto-export (`.beads/issues.jsonl`) or gitnexus stat refresh (`.xtrm/skills/active/**`) noise dirties the tree. Existing `.xtrm/reports/`, `.wolf/`, `.specialists/jobs/`, `dist/` entries unchanged. Hit 8× per multi-chain session before the fix (`unitAI-pqe96`).
- `sp run --background` detached spawn now pipes child stderr (`stdio: ['ignore', 'ignore', 'pipe']`) and forwards it to the parent's stderr, with non-zero exit when the child fails before writing a jobId. Operators no longer see only the generic `Warning: job started but ID not yet available` when the dispatch was refused by the epic-guard or stale-base check — the actual refusal reason surfaces. tmux dispatch path unchanged (tmux captures its own stderr in pane) (`unitAI-xbofm`).
- `sp doctor` Category A check now validates the flat `.xtrm/skills/active/<skill>` symlink layout that `sp init` writes, instead of the scoped `active/claude/<skill>` + `active/pi/<skill>` layout that no longer exists. Loop over `['claude', 'pi']` removed; `.claude/skills` and `.pi/skills` are now expected to symlink directly to `.xtrm/skills/active`. Fresh `sp init` followed by `sp doctor` no longer reports 4 false-positive Category A failures on first run (`unitAI-5voar`).
- `package.json` `files` allowlist tightened to explicit subdirs (`config/specialists/`, `config/mandatory-rules/`, `config/skills/`, `config/catalog/`, `config/nodes/`, `config/hooks/`, `config/presets.json`, plus `LICENSE`). `.npmignore` additionally excludes `config/benchmarks/` and `config/skills/**/evals/`. Payload shrank 258 → 256 files; dev artifacts (benchmarks, evals) no longer ship. CI `package-payload.yml` now asserts `LICENSE` is present (`unitAI-3m27y`).
- Reviewer injected-diff sources (`buildInjectedReviewerDiffVariables` in `src/cli/run.ts`) now filter each source's `files[]` against `AUTO_COMMIT_NOISE_PREFIXES` (`.xtrm/`, `.wolf/`, `.specialists/jobs/`, `.beads/`) before the empty-source fall-through. Noise-only unstaged files (e.g. `.xtrm/SKILL.md` from gitnexus stat refresh) no longer shadow the real branch-vs-base diff. Combined with `unitAI-889dv` (full DB replay), this fully retires the reviewer false-PARTIAL pattern that doubled review-turn counts (`unitAI-lqsha`).
- Reviewer specialist (`config/specialists/reviewer.specialist.json`) blast-radius gate relaxed to accept multiple evidence forms: `gitnexus_impact` event, pre-injected `$gitnexus_summary` block, `gitnexus_detect_changes` event, or LOW `impact_report.highest_risk` in `sp result`. Reviewer only flags a real gap when NONE present AND the diff touches MEDIUM+ surface (auth/secrets/input/public API/schema/control flow/framework). Safety net post-`889dv`'s structural fix (`unitAI-6fsxp`).
- Researcher specialist (`config/specialists/researcher.specialist.json`) consolidated and v-bumped 1.1.0 → 1.2.0. Model: `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` → `openai-codex/gpt-5.4-mini` (qwen3.5-thinking documented to flail with parallel-rejected tool calls; gpt-5.4-mini matches executor's choice — proven for tool-heavy Bash CLI workloads); fallback `google-gemini-cli/gemini-3.1-pro-preview` (long-context fallback for research synthesis). Description rewritten with aggressive "DISPATCH BEFORE answering any library/API/framework/CLI question from training data" framing. System prompt consolidated to 3-mode structure (Targeted / Discovery / Media); skills list reduced from 4 to 1 (the 3 dropped skills — `find-docs`, `deepwiki`, `github-search` — were 100% duplicates of inlined prompt content; saves ~3-4k tokens per dispatch). `mandatory_rules` adds `per-turn-handoff-schema`. Stale `.specialists/user/researcher.specialist.json` overlay removed.
- All specialists swapped off `anthropic/claude-*` models — operator environments without Anthropic API access can now dispatch every specialist without silent dispatch failures. Three specialists had Claude as PRIMARY and were fully broken: `test-runner` (`claude-haiku-4-5` → `openai-codex/gpt-5.4-mini`), `specialists-creator` (`claude-sonnet-4-6` → `openai-codex/gpt-5.5`), `xt-merge` (`claude-sonnet-4-6` → `openai-codex/gpt-5.4-mini`). Six others had Claude as fallback (silent never-fire on primary failure): `overthinker`, `executor`, `changelog-keeper`, `node-coordinator` now fall back to `google-gemini-cli/gemini-3.1-pro-preview`; `explorer`, `changelog-drafter` fall back to `google-gemini-cli/gemini-3-flash-preview`. Final provider distribution: 12 specialists primary on openai-codex, 2 on nano-gpt/glm-5, 0 on anthropic — fallback diversity via gemini + glm.
- `sp init --help`, `sp clean --help`, `sp merge --help`, `sp finalize --help`, `sp doctor --help` refreshed to reflect post-`vwrnq`/`usj9y`/`8tm35`/`wq0mw`/`amzec`/`a6e60`/`pqe96` drift: sp init notes Bun runtime + ordered xtrm-tools install; sp clean documents `--reap-orphans` `dead-toolchain` reason; sp merge usage includes `--target-branch <name>` + auto-ignore note; sp finalize notes SQLite-first verdict read + cascade; sp doctor notes `--check-drift` Category A scope (`unitAI-3r268`).
- `sp finalize <job-id>` now succeeds when reviewer PASS verdict is persisted in SQLite even if `result.txt` was never written. Root cause: `SPECIALISTS_JOB_FILE_OUTPUT` defaults to `off`, so `<jobsDir>/<reviewer-id>/result.txt` never existed for `--job`-launched reviewers; `supervisor.readResult` only checked the file path; the PASS regex never matched. Fix: `supervisor.readResult` now reads `specialist_results.output` via `withSqliteOperation('readResult', ...)` first, falls back to the file. Eliminates the operator-override pattern that required `sp stop <exec>` + manual cleanup after every reviewer PASS dispatched via `--job` (`unitAI-amzec`).
- Executor specialist prompt no longer instructs broad `git add -A` staging. Workflow Step 5 now reads "Prefer runtime `auto_commit: checkpoint_on_waiting`; when manual staging is needed, use explicit paths only". Testing Awareness adds an explicit ban on staging `.beads/`, `.xtrm/`, `.wolf/`, `.specialists/jobs/`, `.pi/`. Self-Review adds a `git diff --cached --name-only` vs bead SCOPE check. Closes the silent-worktree-index-contamination class that broke `mercury-market-data .beads` via PR #103 on 2026-05-11 (`unitAI-dmu9q`).
- `sp init` now prints actionable, ordered recovery commands when the xtrm prerequisite is missing. Two distinct error paths: missing `xt` CLI → "install xtrm-tools globally → xt install → xt init → verify"; present `xt` CLI but missing `.xtrm/` → "run xt init in this repo → verify". `package.json` adds an underscore-prefixed `_runtime_prerequisites.xtrm-tools` field documenting the requirement without adding an npm dependency. README quickstart, `src/cli/quickstart.ts` step 1, `docs/installation.md`, and `docs/bootstrap.md` now declare the ordered install path Bun → xtrm-tools → xt install → xt init → @jaggerxtrm/specialists → sp init. `sp list`, `sp doctor --check-drift`, and `sp prune-stale-defaults` are documented as Category A commands that do not require `xt` or `.xtrm/` (`unitAI-usj9y`, audit `unitAI-go847`, docs `unitAI-6xm0f`).
- Tool catalog is now package-canonical at `config/catalog/` (was `.specialists/catalog/`). `loadSharedToolCatalogIndex` in `src/pi/session.ts` tries cwd `.specialists/catalog/index.json` first (user override path — created on demand) and falls back to `resolveCanonicalAssetDir('catalog')/index.json` from the installed package. Eliminates the silent-tool-policy-degrade that occurred for npm-installed users without a source checkout — verified by `sp list` working from a non-repo cwd. `docs/installation.md` Category A list now explicitly names `config/catalog/`. File history preserved via `git mv` (`unitAI-jj7hy`).
- AGENTS.md Specialists block is now wrapped in `<!-- specialists:start --> ... <!-- specialists:end -->` HTML sentinels, making `sp init` re-runs fully idempotent. `ensureAgentsMd` has four branches: file missing → write block; sentinels present → byte-identical replace (no-op when unchanged); legacy `## Specialists` marker but no sentinels → migrate by parsing from marker to next H2 / EOF and replacing the full legacy span; neither → append. `README.md` line 82 no longer falsely claims `sp init` injects `CLAUDE.md` (it never did; the line was a 2026-05 audit finding) (`unitAI-sgw9g`, audit `unitAI-3o3gf`).
- `package.json` declares `engines.bun: ">=1.0.0"` (was `node: ">=16.0.0"` which was misleading — the built `dist/index.js` is `bun build --target=bun` with `#!/usr/bin/env bun` shebang and uses bun-only APIs). `src/index.ts` adds an early `globalThis.Bun` runtime guard that prints an actionable error with the `https://bun.sh/install` URL and exits non-zero — defense in depth for code paths where Bun is technically available but the import sequence runs before the shebang takes effect. README quick start, `src/cli/quickstart.ts`, and `docs/installation.md` now declare Bun as a runtime prerequisite (`unitAI-vwrnq`).
- `sp ps` process-health specialist count no longer treats Serena/GitNexus MCP servers, tsserver, shell wrappers, or generic tooling as specialist jobs. The count is now intentionally narrow: direct `sp/specialists run` commands and pi-coding-agent processes only. Unknown `sp ps` flags now fail fast; `sp ps --ps` points operators to `sp clean --ps` (`unitAI-f2vhd`).
- `sp ps` no longer defaults to raw historical terminal rows. The default dashboard shows active jobs plus unresolved terminal problems, detailed process tables require `--health`, and Dolt/orphan regressions raise WARN instead of a false OK (`unitAI-0wbhi`, `unitAI-eeiza`, `unitAI-59nry`).
- `sp clean --reap-orphans` also detects deleted-cwd Dolt/tool leaks, covering stale worktree cleanup cases missed by the initial orphan collector (`unitAI-uxpl2`).
- Reviewer evidence collection now surfaces executor GitNexus tool-call evidence: reviewer prompt instructs `sp feed <reviewed_job_id>` fallback, and runner pre-injects `$gitnexus_summary` from the reviewed executor's `run_complete` observability event when dispatched with `--job` (`unitAI-gufaf`).
- `provisionWorktree`: drop the `.beads` dir→symlink swap entirely. Worktree provisioning now `rm -rf <worktree>/.beads` and marks the tracked `.beads/*` paths as `skip-worktree` via the new `markBeadsSkipWorktree` helper. Modern bd 1.0.3 stores `core.hooksPath` as an absolute parent path at `bd init`, so the worktree inherits parent hooks via shared git config — no on-disk `.beads/` is needed, and bd resolves the DB via git common-dir. Removes a serious merge hazard: any branch carrying the worktree-local `.beads` symlink (mode 120000) wipes the parent's `.beads/` on squash-merge into main (real incident: projects/infra PR #39, 2026-05-12). Removes now-unused `readFileSync`/`writeFileSync` imports. Supersedes `unitAI-u08e8` / `xtrm-nsca`. The xtrm-tools `xt end` pre-push guard (`xtrm-w1ip`) stays in place as defense-in-depth for older clones and non-CLI push paths (`unitAI-yvqmf`).
- `provisionWorktree` previously suppressed phantom `.beads/` deletions inside specialist worktree checkpoint commits via `info/exclude` + `skip-worktree`. Now superseded by `unitAI-yvqmf` above (no symlink → no noise to suppress) (`unitAI-u08e8`).
- `sp run --bead <id>` no longer race-spawns duplicate jobs against the same bead+specialist when a keep-alive job is already in `waiting`. The active-job check now includes `waiting` (was `starting`/`running` only), and `sp run` performs an early SQLite pre-flight before the supervisor fork — failing fast with `existing <status> job '<id>' already targets bead '<id>'` plus a hint to resume via `--job <id>` or cancel via `sp stop <id>` (`unitAI-55cb3`).
- `supervisor.handleResumeTurn` now auto-finalizes a keep-alive session when the resume turn produces a PASS-shaped Compliance Verdict — closes the gap that made `sp finalize <id>` necessary after every resume-driven PASS. Initial-turn auto-finalize was already in place; the resume-turn path now mirrors it (`unitAI-y6crh`).
- `supervisor` now triggers `npx gitnexus analyze` immediately after each successful auto-commit checkpoint for MEDIUM/HIGH-permission specialists (was: only at terminal completion). Reviewers/orchestrators inspecting a keep-alive worktree mid-session no longer see stale graph data. Embeddings are preserved when `.gitnexus/meta.json` shows `stats.embeddings > 0` (passes `--embeddings`). Checkpoint-time and terminal-time fires dedupe via `lastGitnexusAnalyzedSha`. Timeline events (`gitnexus_analyze_started` / `gitnexus_analyze_start_failed`) tag `backend` with the source (`checkpoint` / `terminal`) and use the dual-write `appendTimelineEvent` path so they land in `observability.db` regardless of `SPECIALISTS_JOB_FILE_OUTPUT` gating — visible in `sp feed` / `sp result` (`unitAI-hrsvj`).
- `provisionWorktree` (and xt claude / xt pi `launchWorktreeSession` in xtrm-tools) now replaces bd's stub `.beads/` inside new worktrees with a symlink to `<commonRoot>/.beads`. bd's post-checkout/pre-commit/post-merge git hooks (registered via parent's `core.hooksPath = .beads/hooks/`) re-fire on any git operation inside the worktree (notably supervisor's auto-commit checkpoint) and would otherwise re-scaffold a per-worktree `.beads/` + dolt-sql-server (60–200 MB RSS each, plus a process-leak vector on cleanup, plus the user-reported `database 'jaggers_agent_tools' not found` symptom in xtrm-tools). The symlink is preserved by all bd hooks and routes bd inside the worktree to the parent's data — single shared dolt server, shared writes (`unitAI-0wz2p` / `xtrm-as7d`).
- `supervisor.startDetachedGitnexusAnalyze` now invokes `npx gitnexus analyze --skip-agents-md --no-stats` (still passes `--embeddings` when `.gitnexus/meta.json` shows `stats.embeddings > 0`). The graph is still re-indexed (downstream `gitnexus_impact`/`context` queries see fresh data), but the AGENTS.md/CLAUDE.md edit pass and stat-block refresh are skipped — these would dirty the worktree branch on every checkpoint and cause noisy auto-commit churn.
- `pi/session.ts` no longer leaks `gitnexus mcp` / `serena mcp` child processes when a `--keep-alive` specialist is cancelled or torn down. `pi` is now spawned with `detached: true` so it owns its process group, and the cancellation paths (`close()` and `kill()`) replace the old 2s redundant SIGTERM with an 8s graceful window followed by a `process.kill(-pid, 'SIGKILL')` group-kill backstop. The redundant SIGTERM had been racing pi's in-flight MCP dispose: pi's RPC-mode handler at `rpc-mode.js:533` saw `shuttingDown=true` and called `process.exit(143)` synchronously, aborting `manager.closeAll()` mid-flight and orphaning MCP children to PID 1. The new window is enough for the worst-case ~4s/server `transport.close()` graceful path; the group-SIGKILL backstop reaps anything that survives (`unitAI-1phu7` / `unitAI-ctl0o`).
- `tests/integration/cli/run.integration.test.ts` background cases now bootstrap the observability DB via the CLI pre-run path (`src/cli/run.ts` `ensureObservabilityDb`) and the tmux dispatch path falls back to an active-job SQLite lookup when the 5s `latest` poll-deadline expires. Background dispatches no longer print the generic "Warning: job started but ID not yet available" when the child is alive and registered — operators see the real job id (`unitAI-sxmmy`, `unitAI-dq6vr`).
- `beads-commit-gate` no longer cascades when a reviewer auto-claims a review bead. The gate now requires an explicit owner KV before treating a claim as actionable; cleanup + docs added, regression test in place (`unitAI-352ni`).
- All 4 residual npm audit findings rooted in `@modelcontextprotocol/sdk@1.29.0`'s transitive chain patched via `package.json` `overrides`: `fast-uri` ^3.1.2 (high; path traversal + host confusion), `ip-address` ^10.2.0 (moderate; XSS in Address6 HTML methods), `hono` ^4.12.18 (moderate; 6 advisories incl JWT validation + cache leakage). `npm audit` returns 0 vulnerabilities (down from 20 pre-release). MCP SDK is already at latest; overrides should be removed when an upstream release bumps these (`unitAI-938u5`).

### Changed
- Specialist prompt library cleanup (epic `unitAI-q4669`, 4 rounds): added `~/.xtrm/skills/default` as second pi skills fallback path in `.pi/settings.json` (defense-in-depth; canonical path remains `.xtrm/skills/active` via project symlink chain into the installed xtrm-tools); authored 4 new shared mandatory rules (`code-quality-defaults`, `diagnose-loop`, `research-tool-routing`, `security-review-defaults`); expanded `gitnexus-required` with an execution-flow bullet; pruned 22 redundant `skills.paths` entries across 10 specialists (`code-sanity`, `debugger`, `executor`, `explorer`, `memory-processor`, `overthinker`, `planner`, `researcher`, `reviewer`, `security-auditor`); opted in `per-turn-handoff-schema` + `bead-id-verbatim` for 8 more specialists (node-coordinator deliberately excluded — its prompt explicitly forbids JSON output as final coordinator surface); `sp list-rules` confirms zero orphan rules. Cross-repo follow-up tracked as `xtrm-4h6u` (installer should scaffold both pi skills paths by default).
- Debugger discipline hardened (`unitAI-si4yi`, discovered from `unitAI-tytob`): `config/mandatory-rules/diagnose-loop.md` expanded with Matt Pocock-style contract — fast deterministic feedback loop required before code changes (blocker if unreproducible); 3–5 falsifiable hypotheses tested one variable at a time; `[DEBUG-<id>]` tagged instrumentation must be removed before completion; convert minimized repro into regression test only when a correct seam exists, otherwise route the architecture/testability finding to overthinker or planner instead of forcing a brittle test. `debugger-trace-first` rule deleted (redundant with diagnose-loop's first sentence). `config/skills/using-specialists-v3/SKILL.md` adds a new `## Bug Diagnosis Chain` section under "Choosing The Specialist" that tells the orchestrator: do not dispatch executor while bug cause is unknown — default chain is test-runner/debugger → debugger repro+hypotheses → minimal fix → test-runner rerun → code-sanity/security-auditor when risk surface applies → reviewer gate, with overthinker/planner only for architecture/testability fallout.
- `vitest` + `@vitest/coverage-v8` devDependencies bumped from `^2.1.8` to `^4.1.6` (`unitAI-zxz9f`). Resolves the 6 moderate findings in the Vitest 2 tooling chain (vitest/vite/vite-node/esbuild/@vitest/mocker/@vitest/coverage-v8). Empirical comparison on this repo: Vitest 4 is materially less flaky and faster — 87 failed / 1017 passed / 2 unhandled errors / 44s wall vs Vitest 2.1.8 baseline of 135 failed / 969 passed / 10 unhandled errors / 74s wall. No config edits needed: `server.deps.external`, coverage thresholds, and the existing test exclude list carry forward unchanged; all test files use the stable surface (`describe`/`it`/`expect`/`vi`/`beforeEach`/`afterEach`); `bun --bun vitest run` remains the canonical command path.
- `memory-processor` specialist redesigned for N>500 bd memory audits. Old single-pass workflow exhausted context past ~150-200 memories (Phase 5 per-entry classification text + Phase 7 inline `bd forget` cumulated in chat history regardless of model context size). New design: chunked file-backed audit ledger documented in `config/skills/memory-audit-transaction/SKILL.md`, with a pre-script (`config/skills/memory-audit-transaction/scripts/pre-bulk-export.sh`) that runs `bd memories --json` in a single dolt query (~ms, no per-key `bd recall` round-trips) and stages the artifacts at `.tmp/memory-audit/` before the model spawns. Spec system_prompt + task_template rewritten to defer to the skill and forbid: per-entry chat output, default-Current-without-evidence, destructive git commands. Model also switched from `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` to `openai-codex/gpt-5.3-codex` — qwen3.5 via nano-gpt exhibited persistent per-turn flailing (5 rejected tool calls per turn) plus 95% default-to-Current with empty evidence on a live 508-memory audit; gpt-5.3-codex completed the same audit with 91/508 evidence-backed prunes (18% rate) in 22min for $0.019 (`unitAI-pwojn.1`, parent epic `unitAI-pwojn` Phase A; runtime support Phase B+C still open).
- Canonical specialist model defaults migrated off the unavailable `dashscope` provider. `memory-processor` now uses `nano-gpt/deepseek/deepseek-v4-pro-cheaper:thinking` (synthesis workload, operator preference). `researcher` and the `executor-benchmark-matrix` use `nano-gpt/qwen/qwen3.5-397b-a17b-thinking` (faithful family match, 256K context, thinking-enabled). The `cheap` preset in `config/presets.json` switched to `nano-gpt/moonshotai/kimi-k2.5` (no-thinking, matches the preset's `thinking_level: off`). Stale local `.specialists/user/memory-processor.specialist.json` override removed — canonical now matches operator choice (`unitAI-ght3j`).
- `test-runner` specialist v2.0.0 — now polyglot: pre-script detects manifest (`package.json` / `pyproject.toml` / `pytest.ini` / `setup.cfg` / `Cargo.toml` / `go.mod`) and dispatches the canonical test command (`npm test`, `pytest`, `cargo test`, `go test ./...`); falls back to a `[test-runner] no project test manifest detected` descriptive message with exit 0 instead of a missing-binary crash. system prompt + task_template are project-language-aware. `vitest`/`jest` removed from tags (`unitAI-0er69`).
- `executor` and `debugger` specialist prompts soften hardcoded `tsc --noEmit` / `npm run lint` references to neutral "project-appropriate lint and typecheck" phrasing with multi-language examples (Node / Python / Rust / Go) (`unitAI-dults`).
- `executor` post-script is manifest-aware: `package.json` → `npm run lint`, `pyproject.toml`/`setup.cfg` → `ruff` + `mypy` (when on PATH), `Cargo.toml` → `cargo clippy`/`check`, `go.mod` → `go vet`, none → descriptive no-op (`unitAI-dults`).
- `reviewer` specialist system prompt step 4 (Job linkage and evidence collection) now teaches `git diff $(git merge-base HEAD master)..HEAD` for the canonical changed-range and explicitly forbids rebase / squash / reset / amend / hand-merge / making new commits in the reviewed worktree. Auto-commit checkpoints (live since Apr 13 `11e9b016`) produce N-commit feature branches; reviewer was sometimes panicking and trying git surgery. `sp merge` / `sp epic merge` own publication squashing.

### Changed
- `docs/specialists-service.md` documents the full closed `error_type` taxonomy (now includes `template_field_misuse`, `prompt_too_large`, `output_too_large`) and cross-references the Python reference client (`unitAI-huwov`).
- `docs/examples/specialists_client.py` removed; canonical reference now lives at `clients/python/specialists_client.py` (`unitAI-huwov`).
- New `docs/deploying-alongside.md` — copyable compose recipe for adding `specialists-service` to an existing multi-service stack on a non-host network, with the three required tweaks (`user:`, `HOME=/pi-home`, rw `.specialists/`) explained and a symptom→cause→fix troubleshooting matrix (`unitAI-2fz5b`).

---

## [v3.14.1] — 2026-05-07

### Changed
- `changelog-keeper` specialist scoped to `CHANGELOG.md` only — no longer bumps version, builds, commits, tags, pushes, or publishes; the `/releasing` skill owns those steps and dispatches `changelog-keeper` only to fill `[Unreleased]` gaps from xt reports (`unitAI-g29jv`).

---

## [v3.14.0] — 2026-05-07

### Added
- `sp serve` operational logging with `--log-level off|info|debug` and structured JSON `/v1/generate` request events (`unitAI-8y70l`).
- `sp serve --readiness-canary off|warn|require` for Pi child readiness validation (`unitAI-z2vpq`).
- Script-runner JSON output-contract injection from `response_format: json` schema (`unitAI-z2vpq.4`).
- Local dev container name `sp-service-dev` to distinguish repo-local Compose dev service from consumer-owned `specialists-service` (`unitAI-826pp`).
- Paranoid-mode orchestration discipline, sleep-timer monitoring, mandatory security/sanity chain, project-specific specialist guidance, and worktree cleanup steps in `using-specialists-v3` skill.

### Changed
- Script-runner sends rendered prompts via stdin instead of argv to prevent process-list leakage and avoid Pi CLI parsing on `--`/`@`-prefixed content (`unitAI-z2vpq.1`).
- Script-runner spawns Pi child with `cwd: projectDir` so service consumers resolve files relative to their configured project (`unitAI-z2vpq.2`).
- Rendered prompt-size preflight added before Pi spawn (`prompt_too_large`, `execution.prompt_limit_bytes`, `SPECIALISTS_SCRIPT_PROMPT_LIMIT_BYTES`, 4MiB default) (`unitAI-z2vpq.3`).
- `sp serve --allow-local-scripts` and `skills.scripts` in script/service mode now fail-closed until a sandboxed lifecycle exists (`unitAI-z2vpq.7`).
- `--allow-skills-roots` boundary validation switched to normalized `path.relative` containment for both `skills.paths` and `prompt.skill_inherit` (`unitAI-z2vpq.6`).
- Trusted skills forwarded to Pi child as explicit repeated `--skill` arguments only (`unitAI-z2vpq.5`).
- `--db-path` now treated as an exact SQLite file path (`unitAI-z2vpq.8`).
- script-runner forwards `spec.prompt.system` via Pi `--system-prompt` (full override) when set, so non-coding specialists no longer inherit pi's default coding-agent system prompt (`specialists-37x`).
- AGENTS.md: replaced hardcoded `sp` command catalog with `sp help` instruction and added `sp steer` to orchestration command list.

### Fixed
- `--offline` flag now propagates to script-runner Pi invocation in `sp serve` (`f61032a5`).
- Script-runner isolates Pi prompts from project context (`specialists-6vy`).

---

## [v3.13.0] — 2026-05-05

### Added
- Documented the canonical-live Category A and xtrm-managed Category B distribution model, including installation, skill/hook drift, and operator refresh commands (`unitAI-o4khi`).

### Changed
- Removed deprecated `sp poll`; use `sp ps <id> --json` for status, `sp feed <id>` for events, and `sp result <id>` for final output (unitAI-kbxu7).
- `update-specialists` v2.1 now separates specialists-owned runtime refresh (`sp doctor --check-drift`, `sp prune-stale-defaults`) from xtrm-owned asset refresh (`xt doctor`, `xt update`) so operators do not conflate the two distribution tracks (`unitAI-tsnwh.5`, `unitAI-o4khi`, `specialists-4iq`).

### Fixed
- Bundled `sp doctor`, `sp status`, and related diagnostics no longer crash when resolving package metadata from installed `dist/index.js`; version checks now support both source and packaged layouts (`specialists-4iq`).
- `security-auditor` no longer ships machine-specific `/home/dawid/projects/xtrm-tools` skill paths; optional security skills now resolve through repo-relative `.xtrm/skills/optional/...` paths (`specialists-4iq`).

---

## [v3.12.0] — 2026-05-05

### Added
- `specialists list --full` live registry surface now shows worktree behavior, chain position, median runtime, and role-specific mandatory rules for routing (unitAI-5ad59543)
- `using-specialists-v3` skill adds live-registry orchestration guidance and keeps command discovery centered on `specialists list --full` and `sp help` (unitAI-3ecd8ddf; unitAI-d222b022)
- `specialists list` routing descriptions now stay rich enough to support live role selection from registry output (unitAI-a1605ced; unitAI-0539c3cd)

### Changed
- `changelog-keeper` draft flow now uses script-safe changelog synthesis from curated xt reports (unitAI-0b179f8f)
- `sp script` timeout and scope-bleed handling tightened so long-running script work does not bleed into adjacent worktree state (unitAI-22c0bf39)
- Epic merge dirty-state integration tests stabilized after merge/publication edge cases (unitAI-eb68cf6c)
- `sp release` / release-pipeline handoff and `using-specialists-v3` activation docs updated for v3 orchestration flow (unitAI-fc588ba4; unitAI-5677cce8; unitAI-fb0ed5ee)
- Specialist metadata and mandatory rules refreshed so live registry output reflects current roles and policies (unitAI-5b3c3839; unitAI-77e21085; unitAI-d1ca9f96; unitAI-28781c48)

### Fixed
- Scope-bleed fix paired with raised script timeout to keep release drafting bounded (unitAI-22c0bf39)
- `sp epic merge` dirty-tree publication path now survives unrelated dirty state and preserves merge-ready validation (unitAI-eb68cf6c)
- `sp config show --resolved` and repo-local mandatory rules now resolve from current worktree instead of stale global dist (unitAI-77e21085)

---

## [v3.11.0] — 2026-05-03

### Added
- `changelog-keeper` specialist v1 for release-note synthesis from curated xt reports (unitAI-znkgi.2)
- Releasing skill workflow for prepare/publish release flow after CLI removal (unitAI-fhbf4)
- `sp doctor` / `sp status` version-check nudges with cached tag awareness and per-tag dedupe (unitAI-znkgi.9)
- `using-kpi` skill for KPI analysis and payload/runtime observability recipes (unitAI-drs41.4)
- `sp db extract` / `sp db stats` surfaces for KPI extraction and analysis help (unitAI-drs41.4; unitAI-svnft)
- GitNexus-required new-file escape hatch rule for additive specialist/doc changes (unitAI-znkgi.7)
- `sp release prepare` range flags `--from` / `--to` for explicit backfill windows (unitAI-1evl2)
- `sp release` publish-time validation for top-section gating, annotated tag creation, and push flow (unitAI-znkgi.3)

### Changed
- `sp release prepare` now accepts markdown-only specialist output, normalizes missing section keys, and keeps section replacement bounded (unitAI-8elrc; unitAI-1avsn; unitAI-a3s9a)
- `changelog-keeper` output tightened with fallback chain and stricter section fidelity for release drafts (unitAI-8elrc; unitAI-khlqj)
- `sp clean` migrated to DB-first job selection with PID-primary stale-process cleanup (`--processes`) (unitAI-ltwme)
- `sp clean --keep` now preserves chain-root jobs referenced by epic membership by default; `--aggressive-prune` bypasses that protection for hard purges, and `sp ps --include-terminal` renders orphaned terminal epics without dropping chain rows (unitAI-b0bc62)
- `sp script` stdout cap raised to 128MB with incremental parse for oversized streams (unitAI-9cygd; unitAI-a47ub)
- `sp script` retained cap handling fixed so overflow recovery stays stable under repeated reads (unitAI-1avsn; unitAI-a47ub)
- `sp script` template-check / compat guard fix for spec loading under release-related flows (unitAI-r7zte)
- `sp release` semver section label now derives from `--to HEAD` correctly (unitAI-7qu0t)
- `sp release` draft parser now accepts array-shape sections and markdown fallback (unitAI-a3s9a)
- Release parser now accepts JSON drafts missing section keys and backfills empty buckets (unitAI-1avsn)
- `using-specialists-v2`, `update-specialists`, `CLAUDE.md`, `AGENTS.md`, and related docs synced for release awareness and update checks (unitAI-znkgi.5; unitAI-jhhu4.1; unitAI-c190df90)
- `docs/design/gzrx-tool-catalog.md` aligned with source policy for centralized tool catalog design (unitAI-gzrx)
- `src/cli/doctor.ts` drift check now warns on stale user-overlay specialists before they shadow defaults (unitAI-bb3h6)
- `src/specialist/script-runner.ts` and tests got stdout-cap, parse, and tool-allowlist fixes across release/debugger work (unitAI-9cygd; unitAI-1avsn; unitAI-a47ub; unitAI-c6he0)
- `src/cli/release.ts` / `src/cli/version-check.ts` / `src/cli/clean.ts` got the release, version-check, and DB-first cleanup flow updates (unitAI-znkgi.3; unitAI-znkgi.9; unitAI-ltwme)
- `docs/observability-metrics.md`, `docs/cli-reference.md`, and skill mirrors updated for KPI and release workflow drift (unitAI-drs41.4; unitAI-znkgi.5)

### Fixed
- Release draft rendering now handles markdown-only output and JSON drafts missing section keys without losing bullets (unitAI-8elrc; unitAI-1avsn)
- `sp script` overflow handling now preserves retained caps across parse retries and large stdout bursts (unitAI-a47ub)
- `sp release` publish/prepare validation now rejects section-label and array-shape edge cases before bad tags land (unitAI-7qu0t; unitAI-a3s9a)
- `sp clean` no longer depends on file-era job dirs and survives deleted process state (unitAI-ltwme)

### Removed
- `sp release` CLI path replaced by releasing skill workflow for publishing releases (unitAI-fhbf4)

---

## [3.10.0] - 2026-04-27

Reviewer traceability, hook DB migration, `/lib` export, `list-rules` CLI, and the `serena-cheatsheet` mandatory rule.

### Added
- `sp list-rules` — rule × specialist matrix CLI for inspecting which mandatory rules each specialist loads (unitAI-wv3l9)
- `/lib` subpath export for Node consumers embedding the runner library (unitAI-rw13n)
- `serena-cheatsheet` mandatory rule providing per-specialist Serena-tool guidance, opt-in via `template_sets` (unitAI-acb59b59)
- Auto-close linked bead on terminal job status (cancelled/done/error) — supervisor closes the bead when the job ends (unitAI-9truh)
- PID-liveness inference for zombie job visibility in readers (unitAI-zw9w1)
- `output_type` surfaced in `SupervisorStatus` and `run_complete` events (unitAI-e90j)

### Changed
- Default `--context-depth` raised from 1 to 3 — chained specialists now see own bead + predecessor + parent task by default (unitAI-231x)
- `sp poll` deprecated in favor of `sp ps` (state) + `sp feed` (stream) (unitAI-zjhsj)
- Reviewer prompts now include diff context wired through cleanly (unitAI-18d1d)
- `serena-cheatsheet` removed from `default_template_sets`; specialists must opt in explicitly (unitAI-49188)

### Fixed
- `specialists-complete` hook reads job state via `sp ps` (DB-first) instead of stale file paths (unitAI-q5k2p)
- `specialists-creator` spec now includes `fallback_model` field as required (unitAI-9ilgw)
- Reviewer traceability gaps for GitNexus invocation evidence and injected diff context (unitAI-ctkk9)
- CLI help test stabilized for bun spawn behavior (unitAI-56f98)

---

## [3.9.0] - 2026-04-26

`fln4q-epic` SQLite observability migration, `specialists-service` v1 (HTTP + CLI surfaces for script-class specialists), `sp script` CLI, and a strict 1:1 schema-to-runtime cut.

### Added
- `sp script` CLI — synchronous one-shot specialist invocation (READ_ONLY, template + variables, JSON out) for service/script consumers (unitAI-2cbbae)
- `specialists-service` v1 — HTTP and CLI surfaces for script-class specialists (`sp serve` + `sp script`) (unitAI-fln4q)
- Script target validate mode for pre-run validation of scripts/commands/tools/shebangs (unitAI-4b591)
- Pre-flight `pi-coding-agent` compat regression CI workflow (unitAI-5077f)
- Mercury atomic-summarizer schema-target PoC example (unitAI-f2075)
- Python adapter reference for `darth-feedor` migration (unitAI-f98788)

### Changed
- **Strict 1:1 schema-to-runtime cut**: every JSON field must map to a runtime consumer. Dropped `CommunicationSchema` (`next_specialists`, `publishes`), `capabilities.diagnostic_scripts`, `prompt.normalize_template`, `prompt.examples`, `execution.preferred_profile`, `execution.approval_mode`, `metadata.author`, `metadata.created`, root `heartbeat`, deprecated `ScriptEntry.path` alias. 26 specs + `docs/authoring.md` + `config/skills/specialists-creator/SKILL.md` + `src/cli/view.ts` + `scaffold-specialist.ts` updated in lockstep (unitAI-68edd, unitAI-8n0aa)
- Schema validation now uniform across all 26 specs; `xt-merge` `output_to` → `output_file` (typo'd dead alias was silently dropping merge result writes) (unitAI-02deb, unitAI-yb9qu)
- Schema preserves unknown keys via `.passthrough()` on every nested `SpecialistSchema` object — fixes silent acceptance of typo'd fields (unitAI-f27c8)
- `--user-dir` → `--project-dir` rename in `sp script` and `sp serve` with deprecated alias retained (unitAI-rfjbd)
- Pi 0.70.x compatibility — dropped `args.push('--', prompt)` option terminator in `script-runner.ts`; image base unpinned to `@latest` (unitAI-w0h7z)
- `fln4q-A`: env-gated file fallback for `attach`/`list`/`poll`/`status`/`feed_specialist` with `SPECIALISTS_JOB_FILE_OUTPUT` (unitAI-5521c)
- `fln4q-B`: detached watchdog DB-backed child read path; `cleanupProcesses` file fallback gated by env (unitAI-50283, unitAI-91cfea)
- `fln4q-B2` v2: Bun runtime helper, mode-split watchdog, read-only DB child (unitAI-73c1d)
- DB-first job reads, crash recovery, event reads, job cleanup readers (multiple commits, fln4q-epic)
- Supervisor file writes gated behind `SPECIALISTS_JOB_FILE_OUTPUT` env (unitAI-ppkdg)
- README documentation map points to specialists-service docs
- `sp serve` and `sp script` surfaced in core commands list (unitAI-2f8f4)
- `db` legacy migration tooling clarified; canonical store is SQLite (unitAI-23a1c, unitAI-3425a)

### Fixed
- NDJSON parser handles pi's real `message_end` and `agent_end` shapes (prior parser matched a fictional shape that the test mock perpetuated) (unitAI-68owr)
- Pi `errorMessage` surfacing — when content is empty, `message.errorMessage` flows through error taxonomy so quota/auth errors no longer silently return success-with-empty-output (unitAI-68owr)
- JSON-mode markdown fence stripping — `stripMarkdownFences()` runs before `JSON.parse` for `response_format=json` so kimi-style fenced output parses (unitAI-68owr)
- `specialists-creator` JSON corruption — zsh prompt artifact had been pasted into the file as a JSON key; only caught after `.passthrough()` exposed the silent survival of unknown keys (unitAI-826wl)
- Stale `.xtrm/skills/active/pi/<name>/` skill paths bulk-swept across canonical and mirror specs (`pi/` subdirectory removed in prior layout migration but references lingered) (unitAI-826wl)
- `withSqliteOperation` callbacks now return non-undefined sentinel (unitAI-f30e56)

### Removed
- `parallel-review` specialist files (renamed to `parallel-runner` in 3.4.0; spec files lingered until cleanup)
- 11 declarative-only schema fields (no runtime consumer — see Changed → strict 1:1 schema cut)

---

## [3.8.0] - 2026-04-26

`specialists-service` v1 — HTTP and CLI surfaces for script-class specialists, plus a strict 1:1 schema cut so every JSON field maps to a runtime consumer.

### Added
- **`sp serve`**: Node `http` server exposing `POST /v1/generate` and `GET /healthz` for script-class specialists; real semaphore queue with HTTP 429 on contention, SIGTERM forwarding to in-flight pi children, 4MB stdout cap, trace rows persisted to canonical `observability.db` with `surface: 'script_specialist'` (unitAI-c6uvn).
- **`sp script <name>`**: One-shot CLI peer to `sp serve` for cron and host scripts; cron-friendly exit codes (0/1/2/3/4/5/6/7/75); `--single-instance <lockpath>` uses `flock` with `EX_TEMPFAIL` on contention (unitAI-6qctn).
- **`sp validate <path> --target script`**: Offline pre-deploy validator that runs schema parse plus `compatGuard` and exits non-zero on failure with structured error (unitAI-bahj1).
- **Docker image**: Multi-stage `oven/bun` build, non-root UID 10001 user, `WORKDIR /work`, `ARG PI_VERSION=latest`. Sidecar template at `docker/compose.example.yml` (unitAI-atwom).
- **CI canary `.github/workflows/pi-compat.yml`**: Weekly cron + PR-triggered smoke that fails loud on pi spawn-flag drift; no quota, no secrets, no LLM calls (unitAI-nsru6).
- **Reference Python adapter `docs/examples/specialists_client.py`**: Stdlib-only, mirrors the closed `error_type` union with a `TRANSPORT` value for caller-side HTTP failures; live-smoked end-to-end against real pi (unitAI-s2won).
- **Reference script-class spec `docs/examples/mercury-atomic-summarizer.specialist.json`**: Phase 1 first-spec, copyable, validated against the migration doc's schema target (unitAI-t9t11).
- **Reference smoke spec `docs/examples/smoke-echo.specialist.json`**: For verifying a fresh deployment.
- **`handoff-feedor.md`**: One-page operator handoff at repo root for adopting `specialists-service` v1 in darth-feedor.
- **Documentation**: `docs/specialists-service.md` (canonical contract), `docs/specialists-service-install.md` (build-from-repo install with rootless-podman + Fedora-SELinux notes), `docs/specialists-service-evaluation.md` (production-evaluation memo), `docs/release-image.md` (maintainer build/push reference), `Script-class authoring` section in `docs/authoring.md`, `Schema target` translation table in `docs/darth-feedor-migration.md`.
- **Spec uniformity audit script `config/skills/specialists-creator/scripts/audit-spec-uniformity.mjs`**: Portable, reports parse failures and unknown keys; KNOWN sets stay in lockstep with `src/specialist/schema.ts`.

### Changed
- **Zod schema passthrough**: `SpecialistSchema` now uses `.passthrough()` on every nested object so unknown keys survive `parseSpecialist()` and `sp edit` round-trip stops silently dropping fields (unitAI-xutg2).
- **Strict 1:1 schema-to-runtime cut**: Every JSON field must map to a runtime consumer (unitAI-8n0aa). Dropped `CommunicationSchema` entirely (`next_specialists`, `publishes`), `capabilities.diagnostic_scripts`, `prompt.normalize_template`, `prompt.examples`, `execution.preferred_profile`, `execution.approval_mode`, `metadata.author`, `metadata.created`, root `heartbeat`, and the deprecated `ScriptEntry.path` alias. 26 specs, `docs/authoring.md`, `config/skills/specialists-creator/SKILL.md`, `src/cli/view.ts`, and `scaffold-specialist.ts` updated in lockstep.
- **`--user-dir` → `--project-dir`**: Flag renamed in `sp script` and `sp serve` (the flag has always been the project root, not a user-spec dir); `--user-dir` retained as a deprecated alias (unitAI-rfjbd).
- **Pi 0.70.x compatibility**: Dropped the `args.push('--', prompt)` option terminator in `src/specialist/script-runner.ts`; both 0.64 and 0.70.2 accept positional prompt. Image base unpinned to `@earendil-works/pi-coding-agent@latest` (unitAI-w0h7z).
- **`xt-merge` output_to → output_file**: Migrated to canonical top-level field — a typo'd dead alias had been silently dropping `merge-prs-result.md` writes since the spec was authored (unitAI-yb9qu).
- **README documentation map**: Now points to the new specialists-service docs.

### Fixed
- **NDJSON parser real shape handling**: Now handles pi's real `message_end` and `agent_end` event shapes; prior parser matched a fictional shape that the test mock perpetuated, returning empty assistant text in production (unitAI-68owr).
- **Pi `errorMessage` surfacing**: When content is empty, `message.errorMessage` is surfaced through the error taxonomy so quota and auth errors no longer silently return `success: true` with empty output (unitAI-68owr).
- **JSON-mode markdown fence stripping**: `stripMarkdownFences()` runs before `JSON.parse` for `response_format=json` responses; some models (e.g. kimi) wrap JSON in markdown code fences regardless of the format directive (unitAI-68owr).
- **`specialists-creator.specialist.json` JSON corruption**: A zsh prompt artifact had been pasted into the file as a JSON key (`"permission_requiredspecialists — zsh "`); only caught after `.passthrough()` exposed the silent survival of unknown keys (unitAI-826wl).
- **Stale skill-path sweep**: Bulk-swept 19 stale `.xtrm/skills/active/pi/<name>/` skill paths across canonical and mirror specs; the `pi/` subdirectory was removed in a prior layout migration but the references were never updated (unitAI-826wl).

### Removed
- **`parallel-review` specialist files**: Removed from canonical and mirror (renamed to `parallel-runner` in 3.4.0; spec files lingered until this cleanup).
- **11 declarative-only schema fields**: See Changed → strict 1:1 schema cut. None had a runtime consumer.

[Unreleased]: https://github.com/Jaggerxtrm/specialists/compare/v3.11.0...HEAD
[v3.11.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.11.0
[3.10.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.10.0
[3.9.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.9.0
[3.8.0]: https://github.com/Jaggerxtrm/specialists/releases/tag/v3.8.0
