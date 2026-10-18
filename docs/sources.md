# Sources

This file lists every paper and document this benchmark cites: what each one says that we rely on, and what we take from it. A source is added here before it is cited anywhere else in the repository. Each number is quoted with the version it comes from. All sources were read on 2026-10-18.

## Evaluating AGENTS.md

Gloaguen, Mündler, Müller, Raychev, Vechev. *Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?* [arXiv 2602.11988](https://arxiv.org/abs/2602.11988), v3 revised 2026-09-29; ICLR 2026.

- **Abstract (v3):** context files "do not generally improve task success rates" and raise inference cost by over 20% on average.
- **v1 §4.2:**
  - cost: up about 20% on SWE-bench Lite and 23% on AGENTbench with LLM-generated files; at most 19% with developer-written files
  - success with LLM-generated files: down 0.5% (SWE-bench Lite) and 2% (AGENTbench)
- **v1 introduction:** gives −3% for LLM-generated files and +4% for developer-written ones. This disagrees with §4.2.
- **Conclusion (v3):** context files are useful for specifying non-standard coding practices; repository overviews are not helpful.

**We take:** the overhead area (8), and planted facts that are non-standard choices.

## VibeMemBench

Fan, Shi, Li, Sun, Chen, Xu, Wei, Ni, Yang, Ye. *VibeMemBench: Evaluating Memory Systems for Coding Agents on Real Repository Coding Tasks.* [arXiv 2609.23570](https://arxiv.org/abs/2609.23570), v1 2026-09-20.

- **Data:** 111 coding targets from 90 SWE-rebench V2 repositories, plus 3,634 history trajectories. A target is kept only if injected history improves its executable outcome.
- **Arms:** memory off; direct injection of verified experience; four existing memory systems. Every arm is compared with a matched memory-off run.
- **Measured:** task resolution by executable tests, and agent steps.
- **Direct injection:** +1.1 to +4.5 percentage points on 4 of 5 solvers, and fewer steps on all 5.
- **Existing memory systems:** 11 of 12 system × solver pairings failed to beat the matched memory-off run.

**We take:** the matched with/without design. Condition D is close to their direct injection. A memory system can fail to help, and results are reported either way.

## LongMemEval

Wu et al. *LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory.* [arXiv 2410.10813](https://arxiv.org/abs/2410.10813); ICLR 2025.

- 500 questions embedded in chat histories that can be scaled up.
- **Five abilities:** information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention.
- Commercial chat assistants and long-context LLMs lose about 30% accuracy over sustained interactions.
- Memory design is split into three stages: indexing, retrieval and reading.

**We take:** areas 1–4 (temporal reasoning is folded into recall).

## MemoryCode

Rakotonirina et al. *From Tools to Teammates: Evaluating LLMs in Multi-Session Coding Interactions.* [arXiv 2502.13791](https://arxiv.org/abs/2502.13791), 2025.

- Synthetic multi-session mentor–mentee dialogues, with coding instructions mixed into unrelated filler.
- Models follow isolated instructions well, but degrade when instructions are spread across sessions and revised over time.

**We take:** distractor sessions and replaced facts in the histories, and the reason condition B should get worse as history grows.

## Mem0

Chhikara, Khant, Aryan, Singh, Yadav. *Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory.* [arXiv 2504.19413](https://arxiv.org/abs/2504.19413), v1 2025-04-28.

- **Full-context baseline:** the whole conversation is passed to the model, about 26,000 tokens on LoCoMo.
- **Abstract claims:**
  - 26% relative improvement over OpenAI on an LLM-as-a-Judge metric
  - 91% lower p95 latency
  - over 90% token cost saved against full context
- **Latency table:** total p95 of 17.117 s for full context against 1.440 s for Mem0.

**We take:** condition B is the standard full-context baseline.

## Context Rot

Hong, Troynikov, Huber. *Context Rot: How Increasing Input Tokens Impacts LLM Performance.* [Chroma technical report](https://trychroma.com/research/context-rot), 2025-07-14.

- 18 models become less reliable as input grows, even on deliberately simple tasks.
- Distractors close in topic to the target information make it worse.
- Chroma sells retrieval infrastructure, which is worth remembering when reading its framing.

**We take:** the reason for area 9. This report does not give a "half the context window" threshold; nothing we found does.

## Claude Code documentation

Anthropic. [Headless mode](https://code.claude.com/docs/en/headless), [cloud sessions](https://code.claude.com/docs/en/claude-code-on-the-web), [cloud environments](https://code.claude.com/docs/en/cloud-environments). Read with Claude Code 2.1.302.

- `claude -p --output-format json` reports usage and `total_cost_usd`. Both are client-side estimates of cost, so we use tokens as the primary number.
- `--bare` skips CLAUDE.md, skills, plugins, MCP servers and auto-memory, but accepts only an API key, so this benchmark does not use it.
- **Cloud sessions:**
  - count against plan usage, with no separate charge for the machine
  - come with Node 20–22 and npm
  - can use a setup script to write `~/.claude/CLAUDE.md`, which loads as user instructions
  - set `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` themselves, so compaction triggers partway through the window rather than when it fills

**We take:** the measurement source, the isolation design (a separate config directory instead of `--bare`), and the case for running in the cloud.
