# 01 统一 PRD 与领域词汇基线

Status: needs-triage
Type: HITL

## What to build

建立 FakeRadio V1 的统一 PRD、模块边界和领域词汇基线，让后续所有模块开发都能回指同一套产品语言、边界约束和非目标定义。

这条 slice 要交付的不是某一层代码，而是一套可被所有后续模块共同消费的规范基线。完成后，FakeRadio 的播放器体验层、本地服务中枢、DJ brain、音乐来源 adapter、TTS、状态与调度、环境输入、运行与可观测性都必须使用统一词汇描述自己的职责。

## Acceptance criteria

- [ ] `.scratch/fakeradio-v1/PRD.md` 存在，并完整描述 Problem Statement、Solution、User Stories、Implementation Decisions、Testing Decisions、Out of Scope 和 Further Notes
- [ ] PRD 中明确固定 8 个模块边界，并与现有 `CONTEXT.md` 和 ADR 术语一致
- [ ] 后续 issue 都能以该 PRD 作为统一父文档引用

## Blocked by

None - can start immediately

## Comments

- 这是 FakeRadio V1 的规范基线，不直接交付用户可见功能，但它是所有后续 slices 的语言与边界来源。
