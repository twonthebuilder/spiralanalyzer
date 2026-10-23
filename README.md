# Spiral Analyzer

A React-based, client-side research prototype for exploring repetition, text structure, and possible drift in AI-agent transcripts. It helps an operator **inspect suspicious patterns**; it does not establish that a model has failed, identify a root cause, or predict an imminent collapse.

> **Repository status (October 2026):** This repository contains a single React JSX component (`spiralanalyzer.js`) and this README. It does **not** include a package manifest, runnable web-app scaffold, automated tests, or a hosted deployment. The component originated as a Claude Artifact and has not been independently validated here as a standalone application.

## Origin

During a 30-day autonomous-agent experiment, Iris (then running Gemini 2.0 Flash) produced increasingly repetitive and fragmented text while a heartbeat report still indicated no errors. That incident motivated this exploratory visualization.

The incident is an observation about one run, not proof that all language-model degradation follows the same progression. The original complete transcript, manual labels, and reproducible evaluation results are not included in this repository.

## What the component actually does

Given a pasted or uploaded **plain-text** transcript, the component splits the text into messages and computes heuristic features for each segment:

| Feature | Implementation and interpretation |
| --- | --- |
| Vocabulary diversity | Unique normalized words divided by whitespace-delimited word count. Lower values can reflect repetition, but are sensitive to length, topic, and language. |
| Within-message repetition | Repeated bigram and trigram fractions; high values can also occur in tables, logs, quotations, and intentional refrains. |
| Cross-message repetition | Fraction of bigrams also seen in up to five preceding messages. |
| Structural indicators | Counts selected punctuation/formatting patterns, capitalization, and approximate sentence length. These are not a linguistic parser. |
| Grammar/typo flags | English-oriented rules for repeated words, missing vowels, repeated letters, capitalization, and fragments. **Higher grammar score means more flagged issues**, not better grammatical integrity. |
| Watchwords | Configurable, case-insensitive substring matches with optional weights. Matches are not restricted to word boundaries and are not evidence of failure by themselves. |
| Loop similarity | Compares a message with earlier messages using trigram, sentence-word, and word-set overlap. A high score means similar text, not necessarily an erroneous loop. |

The component combines selected features using **hand-set thresholds** in `classifyPhase`. The result is an ordinal visualization label, **not a calibrated probability, validated diagnostic category, or clinical-style severity scale**.

### Eight implemented phase labels

The current code defines **eight** labels, not the three-phase classification described in the original README:

| Value | UI label |
| ---: | --- |
| 0 | Coherent |
| 1 | Drift |
| 2 | Rep. Onset |
| 3 | Struct. Decay |
| 4 | Semantic Erosion |
| 5 | Loop Lock |
| 6 | Fragmentation |
| 7 | Terminal |

These are names for heuristic score bands. In particular, the code does not independently verify semantic meaning, contradictions, model internals, or whether recovery is possible. Do not interpret a `Terminal` label as proof that a model cannot recover.

The **Loop sensitivity** slider affects loop highlighting in the timeline. The classifier currently uses its own fixed loop-score cutoffs; changing the slider does not recalibrate the phase classifier.

## Input and usage

The existing React component exposes:

1. A textarea for pasted text, a built-in sample, and local file selection for `.txt`, `.log`, and `.md`.
2. Message splitting by blank line (default), line break, `---`, or a custom regular expression.
3. An **Analyze** action, with Timeline, Loops, and Curves views and filters.
4. Copy/export of results in JSON, CSV, or Markdown.

**Input format matters.** Messages are inferred from the selected text delimiter. The current implementation does **not** parse a JSON array of messages, ChatGPT exports, role metadata, or timestamps into structured records. If your transcript is JSON, convert it to delimited plain text first. Review the resulting message count before interpreting scores; changing the delimiter can materially change results.

**Running the code:** `spiralanalyzer.js` is a React JSX component, not a standalone HTML page or executable Node script. To run it, integrate it into an existing React application with a JSX-capable build pipeline. This repository does not currently provide a verified installation or start command. Do not assume `npm start` or `npm run dev` works from this checkout.

The component computes features locally in the browser and its source contains no explicit transcript-upload request. That is a **source-inspection observation**, not an audit of any external application that might embed the component. Avoid importing confidential transcripts into an untrusted host.

## Reading the output responsibly

- **Phase scores are heuristic.** Compare the underlying text and feature values before concluding that a message has drifted.
- **Length and formatting are confounders.** Very short messages, code, bullet lists, non-English text, quotes, and repeated task templates can trigger misleading flags.
- **Similarity is not necessarily failure.** Deliberate status reports or repeated instructions may resemble loops.
- **The selected delimiter defines the sample.** Splitting one long message into several can change both per-message scores and cross-message comparisons.
- **Watchwords are user-selected signals.** Their counts and weights are not independently validated predictors.
- **The source does not establish a universal phase transition.** Any claimed onset, cliff, or recovery boundary needs independently labeled examples and comparison baselines.

An earlier README reported a 297-message Iris analysis with 197 / 89 / 11 messages in a **three-phase** scheme. Those figures cannot be reproduced from the files currently committed here and must not be presented as results from the current eight-phase implementation.

## Validation needed before stronger claims

A useful next research task would be a small, privacy-safe evaluation set containing:

1. **Positive examples:** independently reviewed excerpts showing genuine unwanted repetition or incoherence, with agreed onset labels.
2. **Negative controls:** coherent but repetitive status updates, structured logs, code, poetry, and short answers.
3. **Robustness cases:** alternative message delimiters, different lengths, languages, and watchword settings.
4. **Reported results:** per-label confusion counts, false-positive and false-negative examples, inter-rater agreement, and sensitivity to thresholds.

Freeze the algorithm and label definitions before testing on held-out transcripts. Preserve sanitized excerpts, exact configuration, code commit SHA, and an executable reproduction procedure. Do not claim accuracy or early-warning performance until these checks exist.

## Current limitations and possible next steps

This is a **post-hoc transcript explorer**, not a live monitor. It does not identify context-window exhaustion, compaction, tool failures, prompting effects, or any other cause of a pattern. The loop comparison checks earlier messages and may become slow on long transcripts; no performance limits have been established.

Practical next steps are to add a minimal React/Vite runner, extract the scoring logic into independently testable functions, add synthetic regression cases, and document a reproducible evaluation protocol. These are **proposals, not completed features**.

## Contributing

Small PRs are welcome, especially reproducible bug reports, sanitized counterexamples, and tests that distinguish harmless repetition from genuine failure. Do not upload private conversations or credentials.

## License

The previous README stated MIT, but no `LICENSE` file is present in this repository. Confirm the intended license and add its full text before relying on an explicit repository license grant.
