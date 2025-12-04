# Document Review System

## Overview

The Document Review System is an AI-powered feature that analyzes project management documents (starting with Project Charters) and provides structured, actionable feedback to improve document quality. It combines LLM analysis with a knowledge database of best practices to deliver consistent, expert-level guidance.

## Key Features

### 1. Multi-Dimensional Analysis
Documents are evaluated across six quality dimensions:

| Dimension | What It Measures |
|-----------|------------------|
| **Completeness** | Are all required fields populated with meaningful content? |
| **Specificity** | Are statements concrete, measurable, and actionable? |
| **Feasibility** | Is the project realistic given scope, timeline, and resources? |
| **Risk Coverage** | Are key risks identified across multiple categories? |
| **Scope Clarity** | Are boundaries clear (what's in vs. out)? |
| **Metric Measurability** | Can success be objectively measured? |

Each dimension receives a score from 0-100, with an overall weighted score.

### 2. Knowledge-Informed Feedback
The system injects relevant best practices, checklists, and anti-patterns from a knowledge database into the review prompt. This ensures feedback is grounded in established project management principles (PMBOK, industry standards, organizational rules).

### 3. Prioritized Feedback
Feedback items are categorized by severity:
- **Critical** - Issues that could cause project failure; must be addressed
- **Important** - Significant gaps that should be addressed
- **Suggestion** - Nice-to-have improvements

### 4. Interactive Review Mode
Users can walk through feedback items one-by-one with an AI assistant that:
- Explains each issue in detail
- Provides elaboration on request
- Tracks acceptance/dismissal of recommendations
- Summarizes progress

### 5. Streaming Support
Real-time feedback display via Server-Sent Events for responsive UX during long reviews.

---

## API Reference

### POST /api/documents/review

Analyzes a document and returns structured feedback.

**Request:**
```json
{
  "docType": "charter",
  "document": {
    "project_name": "Customer Portal Redesign",
    "vision": "Improve customer experience",
    "problem": "Current portal is outdated",
    ...
  },
  "options": {
    "dimensions": ["completeness", "specificity"],
    "severity": "all",
    "model": "gpt-4o-mini"
  }
}
```

**Response:**
```json
{
  "reviewId": "rev_abc123",
  "overall_score": 72,
  "dimension_scores": {
    "completeness": 85,
    "specificity": 60,
    "feasibility": 75,
    "risk_coverage": 65,
    "scope_clarity": 80,
    "metric_measurability": 55
  },
  "strengths": [
    "Clear project timeline with realistic milestones",
    "Well-defined scope boundaries"
  ],
  "feedback": [
    {
      "id": "fb_001",
      "field": "vision",
      "dimension": "specificity",
      "severity": "important",
      "issue": "Vision lacks quantifiable targets",
      "recommendation": "Add specific metrics (e.g., 'reduce processing time by 30%')",
      "example": "Transform customer onboarding from 5 days to same-day activation",
      "status": "pending"
    }
  ],
  "summary": "This charter provides a solid foundation but needs more specific success metrics.",
  "metadata": {
    "modelUsed": "gpt-4o-mini",
    "knowledgeEntriesUsed": ["charter-vision-specificity", "charter-smart-metrics"],
    "processingTimeMs": 3420
  }
}
```

### POST /api/documents/review-stream

Streams review results as Server-Sent Events.

**Events:**
```
event: start
data: {"reviewId": "rev_abc123", "docType": "charter", "timestamp": "..."}

event: overall
data: {"score": 72, "summary": "..."}

event: dimension
data: {"name": "completeness", "score": 85}

event: strength
data: {"text": "Clear project timeline..."}

event: feedback
data: {"id": "fb_001", "field": "vision", "severity": "important", ...}

event: complete
data: {"reviewId": "rev_abc123", "feedbackCount": 8, "overallScore": 72}

event: result
data: {<full review result>}
```

### POST /api/assistant/review/start

Initiates an interactive review session.

**Request:**
```json
{
  "docType": "charter",
  "document": { ... }
}
```

**Response:**
```json
{
  "sessionId": "review_xyz789",
  "status": "reviewing",
  "overallScore": 72,
  "feedbackCount": 8,
  "pendingCount": 8,
  "message": "## Interactive Review Session\n\nYour charter scored **72%** overall...",
  "strengths": ["..."]
}
```

### POST /api/assistant/review/messages

Processes user input in an interactive session.

**Request:**
```json
{
  "sessionId": "review_xyz789",
  "message": "accept"
}
```

**Commands:**
- `accept` / `yes` - Accept current feedback
- `dismiss` / `no` - Dismiss current feedback
- `next` / `skip` - Go to next item
- `previous` / `back` - Go to previous item
- `tell me more` / `elaborate` - Get detailed explanation
- `done` / `complete` - Finish review session
- `goto 3` - Jump to feedback item #3

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Layer                                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   /review   │  │ /review-stream│  │ /assistant/review/*    │  │
│  └──────┬──────┘  └───────┬──────┘  └───────────┬────────────┘  │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Review Engine                              │
│                    (lib/doc/review.js)                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  reviewDocument(docType, config, document, options)     │    │
│  └──────────────────────────┬──────────────────────────────┘    │
└─────────────────────────────┼───────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Knowledge Query │  │  Review Prompt  │  │   LLM Client    │
│    Service      │  │    Loader       │  │   (OpenAI)      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   templates/    │  │   templates/    │  │   Structured    │
│   knowledge/    │  │   charter/      │  │   JSON Response │
│   *.json        │  │ review_*.txt/json│ │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## File Structure

```
api/
├── documents/
│   ├── review.js              # Standard review endpoint
│   └── review-stream.js       # Streaming review endpoint
├── assistant/
│   └── review/
│       ├── start.js           # Start interactive session
│       └── messages.js        # Process session messages

lib/doc/
├── review.js                  # Core review engine

server/
├── knowledge/
│   └── query.js               # Knowledge database query service
├── review/
│   └── Orchestrator.ts        # Interactive session state machine

src/
├── components/
│   └── ReviewPanel.jsx        # React review display component
├── state/slices/
│   └── reviewSession.ts       # Review state management

templates/
├── registry.js                # Extended with review config
├── charter/
│   ├── review_prompt.txt      # Charter review prompt
│   └── review_rules.json      # Charter review rules
├── knowledge/
│   ├── index.json             # Knowledge category manifest
│   ├── charter/
│   │   ├── best_practices.json
│   │   ├── checklists.json
│   │   └── anti_patterns.json
│   └── general/
│       └── principles.json
```

---

## Configuration

### Registry Configuration

Add review configuration to document type manifests in `templates/registry.js`:

```javascript
review: {
  prompt: "charter/review_prompt.txt",
  rules: "charter/review_rules.json",
  knowledgeCategories: ["charter", "general"],
  dimensions: [
    "completeness",
    "specificity",
    "feasibility",
    "risk_coverage",
    "scope_clarity",
    "metric_measurability",
  ],
  thresholds: {
    completeness: 0.8,
    specificity: 0.7,
    feasibility: 0.75,
    risk_coverage: 0.7,
    scope_clarity: 0.75,
    metric_measurability: 0.7,
  },
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REVIEW_MODEL` | `gpt-4o-mini` | OpenAI model for review |
| `OPENAI_API_KEY` | (required) | OpenAI API key |

---

## Usage Examples

### Basic Review

```javascript
const response = await fetch('/api/documents/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    docType: 'charter',
    document: charterData,
  }),
});

const review = await response.json();
console.log(`Overall Score: ${review.overall_score}%`);
console.log(`Feedback Items: ${review.feedback.length}`);
```

### Interactive Review

```javascript
// Start session
const startResponse = await fetch('/api/assistant/review/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ docType: 'charter', document: charterData }),
});
const { sessionId, message } = await startResponse.json();

// Process user input
const msgResponse = await fetch('/api/assistant/review/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ sessionId, message: 'accept' }),
});
const result = await msgResponse.json();
```

### Streaming Review

```javascript
const eventSource = new EventSource('/api/documents/review-stream?docType=charter');

eventSource.addEventListener('overall', (e) => {
  const { score, summary } = JSON.parse(e.data);
  updateOverallScore(score);
});

eventSource.addEventListener('feedback', (e) => {
  const item = JSON.parse(e.data);
  addFeedbackItem(item);
});

eventSource.addEventListener('complete', () => {
  eventSource.close();
});
```

---

## Extending to Other Document Types

To add review support for a new document type (e.g., DDP, SOW):

1. **Create review prompt**: `templates/ddp/review_prompt.txt`
2. **Create review rules**: `templates/ddp/review_rules.json`
3. **Add knowledge entries**: `templates/knowledge/ddp/*.json`
4. **Update registry**: Add `review` config to manifest in `templates/registry.js`

The core review engine handles all document types automatically based on registry configuration.

---

## Scoring Guidelines

| Score Range | Grade | Description |
|-------------|-------|-------------|
| 90-100 | Excellent | Exceeds best practices |
| 75-89 | Good | Meets most best practices with minor gaps |
| 60-74 | Adequate | Meets minimum requirements but needs improvement |
| 40-59 | Needs Work | Significant gaps that could impact project success |
| 0-39 | Critical | Major issues that must be addressed before proceeding |
