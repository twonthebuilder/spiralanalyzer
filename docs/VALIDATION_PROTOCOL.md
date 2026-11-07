# Spiral Analyzer: validation protocol (proposal)

**Status:** Research plan only. No labeled corpus, benchmark run, measured accuracy, or diagnostic validation is provided by this document. The current component is a heuristic transcript explorer, not a validated failure detector.

## Objective and unit of analysis

Test whether the current eight-phase labels and loop scores distinguish unwanted repetition/incoherence from ordinary structured repetition. The unit is a **message within a transcript**, with a separately annotated transcript-level onset (if any). Keep the raw text, delimiter choice, and message index together; do not silently treat a split line as an independent model turn.

## Small first evaluation set

Use synthetic or explicitly authorized, sanitized transcripts. Do not commit private agent logs or identifiable conversations.

| Stratum | Suggested minimum | Intended challenge |
| --- | ---: | --- |
| Coherent ordinary conversation | 10 transcripts | False positives on normal text |
| Repetitive but legitimate status reports | 10 | Templates, recurring tasks, stable terminology |
| Structured logs, tables, and code | 10 | Punctuation and repeated tokens |
| Deliberate refrains or quotations | 5 | Intentional repetition |
| Injected verbatim loops | 10 | Detect known repetition onset |
| Injected truncation/fragmentation | 10 | Detect a visible synthetic corruption onset |
| Short, long, and non-English variants | 10 | Length/language robustness |

These are **proposed sample sizes**, not collected examples or power calculations. Synthetic corruption is a unit-test aid, not proof of real-world failure detection.

## Annotation and provenance

1. Freeze a commit SHA, phase thresholds, watchwords, loop sensitivity, and delimiter configuration before scoring. Preserve a hash of each authorized source and its redacted derivative.
2. Have two independent reviewers label each message **normal**, **unwanted repetition**, **incoherent/fragmented**, or **uncertain** based on visible text, without seeing the tool's score. Mark the earliest supported onset and cite a short sanitized excerpt. Do not force uncertain cases into a positive class.
3. Resolve disagreements separately and report raw agreement plus a chance-corrected agreement statistic when sample size permits. Keep the original independent labels.
4. Split transcripts, not individual messages, between exploratory tuning and a held-out evaluation to avoid leaking adjacent content.
5. Include deliberately repetitive negative controls. Document the source, language, length, and segmentation for every case.

## Evaluation and reporting

- Report confusion counts and precision/recall for **unwanted repetition** and **incoherence** separately, at explicitly declared score/phase thresholds. Show denominators; do not report only overall accuracy.
- Report false-positive examples from legitimate repetition, code/logs, and short messages. Include uncertain and unparseable cases in the denominator accounting.
- Compare default blank-line splitting with line-break and triple-dash splitting on identical text; report changes in message count, labels, and onset index. A different message count is not necessarily a classifier failure, but it changes the evaluation unit.
- Compare watchwords enabled/disabled and loop sensitivity settings. Note that the sensitivity slider currently changes timeline highlighting, not the classifier's fixed loop thresholds.
- Measure execution time and peak memory for increasing transcript sizes in a controlled browser environment; record browser, hardware, and exact inputs. Do not infer production-scale performance from small fixtures.
- Keep a baseline of trivial heuristics (e.g., exact duplicate message and repeated trigram fraction) to establish whether the eight-phase score adds value.

## Stop/go criteria

Before claiming an early-warning detector, require independently labeled real examples, held-out evaluation, acceptable false-positive rates on legitimate repetition, and documented onset lead time against a clearly defined reference event. No numerical success threshold has been established yet; set one **before** inspecting held-out results. Until then, describe phase names as visualization bands only. Never equate a `Terminal` label with irreversible model failure.

## Reproduction record template

Record: source permission and redaction method; transcript identifier/hash; frozen commit; browser/runtime; delimiter and custom regex; watchwords and weights; slider position; message count; reviewer labels; analysis output; evaluation script/version; aggregate confusion counts; negative controls; exceptions; runtime measurements; and known limitations. Publish only sanitized examples and aggregate results where authorized.
