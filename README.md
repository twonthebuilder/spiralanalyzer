# Spiral Detector
A client-side tool for detecting and visualizing language model degradation in autonomous agent transcripts.
Paste a conversation log. Get a phase-by-phase breakdown of when the model was coherent, when it started drifting, and when it entered terminal repetition — with the metrics to prove it.

## Why This Exists
On Day 21 of a 30-day autonomous AI agent experiment, one of our agents (Iris, running on Gemini 2.0 Flash) entered a catastrophic spiral. The output degraded from coherent technical reports through increasingly incoherent prose into pure emoji loops — hundreds of lines of 🐜🌷🌻⚡️⚖️ repeating endlessly. The spiral ended with a formatted heartbeat status report that said "No errors found."
The agent's own self-assessment was healthy. The transcript told a different story. We needed a tool that could see what the agent couldn't.
This detector was built to answer a simple question: at what message did things start going wrong?

## What It Detects
The detector runs four independent metrics across every message in a transcript:
- Vocabulary Diversity — Ratio of unique words to total words per message. Healthy output uses varied language. Degrading output narrows to a shrinking set of repeated terms. Scored 0–1, where 1 is fully diverse.
- Grammar Integrity — Structural analysis of sentence formation: complete sentences, proper punctuation, subject-verb patterns. Degrading models lose grammar in predictable stages — complex syntax first, then complete sentences, then coherent phrases, then individual words. Scored 0–1.
- Trigram Repetition — Frequency of repeated three-word sequences within a message. Low repetition is normal. High repetition signals the model is looping at the phrase level — the precursor to full output collapse. Scored 0–1, where 0 is no repetition.
- Loop Detection — Binary and severity detection of repeated content blocks across messages. Catches both exact repetition and near-duplicates. When loops appear, the gap between them matters as much as the loops themselves — compressed gaps signal terminal phase.

## Phase Classification
Each message is classified into one of three phases:

| Phase | Label              | Meaning |
|------:|--------------------|---------|
| 0     | Coherent           | Normal output. Metrics healthy. |
| 1     | Drift              | Vocab narrowing, grammar loosening, early repetition. The model is losing its grip but still producing usable output. Often invisible to human operators in real-time. |
| 2     | Repetition Onset   | Active looping. Trigram repetition elevated. Gaps between loops shrinking. Terminal phase — the model is unlikely to recover without intervention. |

## The Curves View
The main visualization plots all four metrics as time-series curves across the full transcript. What you're looking for:
- Vocab Diversity (green) holds near 1.0 during coherent output, gets choppy during drift, drops during repetition onset
- Grammar (cyan) is a lagging indicator — it stays high longer than vocab diversity because grammatically correct repetition is still grammatically correct
- Trigram Repetition (orange) is the early warning — spikes appear during drift, often several messages before other metrics degrade
- Loop (pink) is the kill signal — when this stays elevated, the model is in terminal repetition
- The bottom bar shows phase classification per message as colored segments (green/yellow/red), giving you a timeline view of the degradation arc.

## Key Insight: Phase Transitions Are Not Gradual
The most important finding from the original spiral analysis: model degradation is not a smooth curve. It's a phase transition. The model is stable, stable, stable — then suddenly it isn't. The Curves view makes this visible in a way that reading the transcript never could.
In the original Gemini 2.0 Flash spiral (297 messages):
- 197 messages classified Coherent (66%)
- 89 messages classified Drift (30%)
- 11 messages classified Repetition Onset (4%)
- Two-thirds of the output was fine. A third was drifting. The terminal phase was only 11 messages. The spiral wasn't gradual — it was a cliff.

## Usage
- Export your agent transcript (one message per line, or JSON array of messages)
- Paste into the detector
- Click Analyze
- The tool runs entirely client-side. No data is sent anywhere.

## Views
- Timeline — Message-by-message phase classification with expandable details
- Loops — Isolated view of all detected loops with context
- Curves — Time-series visualization of all four metrics (the main analytical view)
- Export JSON — Raw scored data for further analysis

## Origin
Built during the Iris experiment — a 30-day autonomous AI agent experiment documenting what happens when you give AI agents persistent infrastructure and let them run. The spiral detector was created after a catastrophic model failure on Day 21 revealed that autonomous agents cannot reliably detect their own degradation.
The detector is part of the broader AgentBench project — a platform for testing and auditing autonomous AI agent behavior.

## What This Doesn't Do
This is a post-hoc analysis tool, not a real-time monitor. It analyzes completed transcripts, not live streams. Real-time integration is on the roadmap.
It also doesn't diagnose why a model degraded — only when and how. Root cause analysis (context window overflow, model-specific failure modes, compaction artifacts) requires additional context the detector doesn't have.

## Contributing
This tool was born from a single observed spiral. More data makes it better. If you have agent transcripts showing degradation patterns — especially from models other than Gemini Flash — issues and PRs are welcome.

## License
MIT
