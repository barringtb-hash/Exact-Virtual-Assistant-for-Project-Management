# Charter Review Strategy

## Overview

This document outlines a strategy for implementing a **Document Review System** that provides intelligent feedback on project charters and is extensible to all project management document types (SOW, DDP, etc.).

The system combines:
1. **LLM-powered analysis** - Contextual feedback using OpenAI
2. **Knowledge database** - Best practices, industry standards, organizational rules
3. **Structured validation** - Schema-based quality checks
4. **Interactive feedback flow** - User can accept, dismiss, or request elaboration

---

## Architecture Design

### Core Principle: Registry-Driven Extensibility

Following the existing `templates/registry.js` pattern, the review system will be **document-type agnostic** by design.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document Review System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Charter    │    │     SOW      │    │     DDP      │       │
│  │   Review     │    │   Review     │    │   Review     │       │
│  │   Config     │    │   Config     │    │   Config     │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             ▼                                    │
│                  ┌──────────────────┐                            │
│                  │  Review Engine   │                            │
│                  │  (Generic Core)  │                            │
│                  └────────┬─────────┘                            │
│                           │                                      │
│         ┌─────────────────┼─────────────────┐                    │
│         ▼                 ▼                 ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐          │
│  │  LLM        │  │  Knowledge  │  │  Validation     │          │
│  │  Analyzer   │  │  Database   │  │  Rules Engine   │          │
│  └─────────────┘  └─────────────┘  └─────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Review Configuration Schema

Extend the document registry with review-specific configuration:

```javascript
// templates/registry.js - Extended manifest
{
  id: "charter",
  // ... existing config ...

  review: {
    // Review prompt template
    prompt: "charter/review_prompt.txt",

    // Field-specific review rules
    rules: "charter/review_rules.json",

    // Knowledge base categories to query
    knowledgeCategories: ["charter", "project-management", "risk-management"],

    // Minimum quality thresholds
    thresholds: {
      completeness: 0.8,      // 80% of fields populated
      specificity: 0.7,       // 70% score for specificity
      alignment: 0.75         // 75% vision-scope alignment
    },

    // Review dimensions (what to analyze)
    dimensions: [
      "completeness",
      "specificity",
      "feasibility",
      "risk-coverage",
      "scope-clarity",
      "metric-measurability"
    ]
  }
}
```

---

## Review Dimensions

The system evaluates documents across multiple dimensions, each producing structured feedback:

### 1. Completeness
- Are all required fields populated?
- Do array fields (scope, risks, etc.) have sufficient items?
- Are there placeholder values or TBDs?

### 2. Specificity
- Is the vision concrete and measurable?
- Are scope items actionable (not vague)?
- Do risks have clear impact statements?

### 3. Feasibility
- Is the timeline realistic for the scope?
- Are resources (team) adequate for deliverables?
- Do milestones have reasonable durations?

### 4. Risk Coverage
- Are common project risks addressed?
- Do risks have mitigation strategies implied?
- Are assumptions paired with contingencies?

### 5. Scope Clarity
- Is in-scope clearly bounded?
- Is out-of-scope explicitly stated?
- Are scope items mutually exclusive?

### 6. Metric Measurability
- Do success metrics have clear measurement systems?
- Are baselines implied or explicit?
- Can metrics be tracked objectively?

---

## Knowledge Database Design

### Schema

```typescript
interface KnowledgeEntry {
  id: string;                          // Unique identifier
  category: string;                    // "charter" | "risk" | "scope" | etc.
  subcategory?: string;                // "software" | "construction" | etc.
  type: "best_practice" | "checklist" | "example" | "anti_pattern" | "rule";

  title: string;                       // Short title
  content: string;                     // Full guidance text

  // Matching criteria
  triggers: {
    fields?: string[];                 // Fields this applies to
    keywords?: string[];               // Trigger keywords in content
    conditions?: KnowledgeCondition[]; // Programmatic conditions
  };

  // Metadata
  source?: string;                     // "PMBOK" | "internal" | "industry"
  priority: "high" | "medium" | "low";
  tags: string[];

  createdAt: string;
  updatedAt: string;
}

interface KnowledgeCondition {
  field: string;
  operator: "empty" | "contains" | "less_than" | "missing_keyword";
  value?: string | number;
}
```

### Storage Options

**Phase 1: JSON File Storage**
```
templates/knowledge/
├── charter/
│   ├── best_practices.json
│   ├── checklists.json
│   └── anti_patterns.json
├── risk/
│   └── common_risks.json
├── scope/
│   └── scope_guidelines.json
└── index.json              # Category manifest
```

**Phase 2: Vector Database (Future)**
- Embed knowledge entries for semantic search
- Use Pinecone, Weaviate, or pg_vector
- Enable similarity matching to charter content

### Example Knowledge Entries

```json
{
  "id": "charter-vision-specificity",
  "category": "charter",
  "type": "best_practice",
  "title": "Vision Statement Specificity",
  "content": "A strong project vision should answer: What will change? For whom? By when? Avoid abstract statements like 'improve efficiency' without quantifiable targets.",
  "triggers": {
    "fields": ["vision"],
    "conditions": [
      { "field": "vision", "operator": "missing_keyword", "value": "%" }
    ]
  },
  "priority": "high",
  "tags": ["vision", "clarity", "measurable"]
}
```

```json
{
  "id": "risk-coverage-minimum",
  "category": "risk",
  "type": "rule",
  "title": "Minimum Risk Coverage",
  "content": "Projects should identify at least 5 risks across categories: technical, resource, schedule, scope, and external. Each risk should imply impact severity.",
  "triggers": {
    "fields": ["risks"],
    "conditions": [
      { "field": "risks", "operator": "less_than", "value": 5 }
    ]
  },
  "priority": "medium",
  "tags": ["risks", "coverage", "minimum"]
}
```

---

## LLM Integration Strategy

### Review Prompt Structure

```
┌────────────────────────────────────────────┐
│            System Sections                  │
├────────────────────────────────────────────┤
│ 1. Role & Objective                        │
│    "You are a project charter reviewer..." │
├────────────────────────────────────────────┤
│ 2. Document Schema                         │
│    Field definitions & expected formats    │
├────────────────────────────────────────────┤
│ 3. Review Criteria                         │
│    Dimensions to evaluate                  │
├────────────────────────────────────────────┤
│ 4. Knowledge Context                       │
│    Relevant best practices (injected)      │
├────────────────────────────────────────────┤
│ 5. Output Format                           │
│    Structured JSON response schema         │
└────────────────────────────────────────────┘
```

### Review Prompt Template

```markdown
# Project Charter Review

You are an expert project management consultant reviewing a project charter.
Your goal is to provide actionable, specific feedback that improves the charter's
quality and increases project success probability.

## Review Dimensions
Evaluate the charter across these dimensions:
- **Completeness**: Are all essential elements present and populated?
- **Specificity**: Are statements concrete and actionable (not vague)?
- **Feasibility**: Is the project realistic given scope, timeline, and resources?
- **Risk Coverage**: Are key risks identified with adequate coverage?
- **Scope Clarity**: Are boundaries clear (what's in vs. out)?
- **Metric Measurability**: Can success be objectively measured?

## Knowledge Base Context
{{KNOWLEDGE_CONTEXT}}

## Charter Content
{{CHARTER_JSON}}

## Instructions
1. Analyze each field against the review criteria
2. Identify strengths (what's done well)
3. Identify gaps and weaknesses
4. Provide specific, actionable recommendations
5. Prioritize feedback by impact

## Output Format
Return a JSON object with this structure:
{
  "overall_score": 0-100,
  "dimension_scores": {
    "completeness": 0-100,
    "specificity": 0-100,
    ...
  },
  "strengths": ["..."],
  "feedback": [
    {
      "field": "field_id or null for general",
      "dimension": "which dimension this relates to",
      "severity": "critical | important | suggestion",
      "issue": "What's wrong or missing",
      "recommendation": "Specific action to take",
      "example": "Optional example of good practice"
    }
  ],
  "summary": "2-3 sentence overall assessment"
}
```

### Knowledge Injection

Before calling the LLM, query the knowledge database for relevant entries:

```javascript
async function injectKnowledge(charter, docType) {
  const config = getReviewConfig(docType);
  const entries = [];

  // 1. Field-triggered knowledge
  for (const [fieldId, value] of Object.entries(charter)) {
    const fieldKnowledge = await queryKnowledge({
      categories: config.knowledgeCategories,
      triggerField: fieldId,
      content: value
    });
    entries.push(...fieldKnowledge);
  }

  // 2. Condition-triggered knowledge
  const conditionKnowledge = await evaluateConditions(charter, config);
  entries.push(...conditionKnowledge);

  // 3. Deduplicate and format
  const unique = deduplicateById(entries);
  return formatKnowledgeContext(unique);
}
```

---

## API Design

### Endpoints

#### `POST /api/documents/review`

Initiates a document review and returns structured feedback.

**Request:**
```json
{
  "docType": "charter",
  "document": { /* charter fields */ },
  "options": {
    "dimensions": ["completeness", "specificity"],  // Optional filter
    "includeExamples": true,
    "severity": "all"  // "critical" | "important" | "all"
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
      "example": "Transform customer onboarding from 5 days to same-day activation"
    }
  ],
  "summary": "This charter provides a solid foundation but needs more specific success metrics and expanded risk coverage to increase confidence in project success."
}
```

#### `POST /api/documents/review/stream`

Streaming version for real-time feedback display.

**Response (SSE):**
```
event: dimension
data: {"dimension": "completeness", "score": 85, "processing": false}

event: feedback
data: {"field": "vision", "severity": "important", "issue": "..."}

event: feedback
data: {"field": "risks", "severity": "critical", "issue": "..."}

event: complete
data: {"overall_score": 72, "summary": "..."}
```

#### `POST /api/assistant/review/start`

Initiates an interactive review session (guided flow).

#### `POST /api/assistant/review/messages`

Handles user responses in interactive review mode.

---

## Feedback Data Model

```typescript
interface ReviewResult {
  reviewId: string;
  docType: string;
  documentHash: string;           // For caching/deduplication
  timestamp: string;

  scores: {
    overall: number;
    dimensions: Record<ReviewDimension, number>;
  };

  strengths: string[];

  feedback: FeedbackItem[];

  summary: string;

  metadata: {
    modelUsed: string;
    knowledgeEntriesUsed: string[];
    processingTimeMs: number;
  };
}

interface FeedbackItem {
  id: string;
  field: string | null;           // null = general feedback
  dimension: ReviewDimension;
  severity: "critical" | "important" | "suggestion";
  issue: string;
  recommendation: string;
  example?: string;

  // User interaction state
  status: "pending" | "accepted" | "dismissed" | "resolved";
  userNote?: string;
}

type ReviewDimension =
  | "completeness"
  | "specificity"
  | "feasibility"
  | "risk_coverage"
  | "scope_clarity"
  | "metric_measurability";
```

---

## UI/UX Design

### Review Panel Component

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Charter Review                              Score: 72%  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Dimension Scores                                    │   │
│  │  ████████░░ Completeness    85%                     │   │
│  │  ██████░░░░ Specificity     60%                     │   │
│  │  ███████░░░ Feasibility     75%                     │   │
│  │  ██████░░░░ Risk Coverage   65%                     │   │
│  │  ████████░░ Scope Clarity   80%                     │   │
│  │  █████░░░░░ Metrics         55%                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ✓ Strengths                                                │
│  • Clear project timeline with realistic milestones         │
│  • Well-defined scope boundaries                            │
│                                                             │
│  ⚠ Feedback (6 items)                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔴 CRITICAL: risks                                   │   │
│  │ Only 2 risks identified. Best practice is 5+.       │   │
│  │ → Add technical, resource, and external risks.      │   │
│  │                                                      │   │
│  │ [Accept] [Dismiss] [Tell me more]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🟡 IMPORTANT: vision                                 │   │
│  │ Vision lacks quantifiable success targets.          │   │
│  │ → Add specific metrics (e.g., "reduce by 30%")      │   │
│  │                                                      │   │
│  │ [Accept] [Dismiss] [Show example]                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Re-run Review]                        [Export Feedback]   │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points

1. **Post-Extraction Review**: Automatically offer review after charter extraction
2. **Manual Trigger**: "Review Charter" button in toolbar
3. **Pre-Export Check**: Optional review gate before DOCX download
4. **Field-Level Hints**: Inline feedback icons next to fields

---

## Implementation Phases

### Phase 1: Core Review Engine (MVP)
**Scope:**
- Basic `/api/documents/review` endpoint
- Charter-specific review prompt
- Structured JSON response
- Simple feedback display component

**Files to Create/Modify:**
- `api/documents/review.js` - Review endpoint
- `templates/charter/review_prompt.txt` - Review prompt
- `templates/charter/review_rules.json` - Basic rules
- `src/components/ReviewPanel.jsx` - Feedback display
- `lib/doc/review.js` - Review engine core

**Deliverables:**
- Working review endpoint for charters
- Basic UI showing scores and feedback
- Accept/dismiss feedback interactions

---

### Phase 2: Knowledge Database
**Scope:**
- JSON-based knowledge storage
- Knowledge query service
- Automatic knowledge injection into prompts
- Admin interface for managing entries

**Files to Create:**
- `templates/knowledge/` - Knowledge entry files
- `server/knowledge/` - Query service
- `lib/knowledge/loader.js` - Knowledge loader
- `api/admin/knowledge.js` - CRUD endpoints (optional)

**Deliverables:**
- 20+ knowledge entries for charter review
- Knowledge injection in review prompts
- Tagged knowledge by category/field

---

### Phase 3: Multi-Document Support
**Scope:**
- Extend registry with review configs
- SOW review rules and prompts
- DDP review rules and prompts
- Generic review engine supporting all types

**Files to Modify:**
- `templates/registry.js` - Add review configs
- `templates/sow/review_*.json` - SOW review rules
- `templates/ddp/review_*.json` - DDP review rules

**Deliverables:**
- Review support for all document types
- Type-specific knowledge entries
- Unified review UI

---

### Phase 4: Interactive Review Mode
**Scope:**
- Guided review flow (like guided charter)
- Field-by-field feedback walkthrough
- "Tell me more" elaboration requests
- Review state machine

**Files to Create:**
- `api/assistant/review/start.js`
- `api/assistant/review/messages.js`
- `server/review/Orchestrator.ts`
- `src/state/slices/reviewSession.ts`

**Deliverables:**
- Interactive review conversation
- Step-by-step feedback acceptance
- Review session persistence

---

### Phase 5: Advanced Features
**Scope:**
- Streaming review responses
- Vector-based knowledge search
- Review history and comparisons
- Team review sharing
- Custom organizational rules

**Deliverables:**
- Real-time feedback streaming
- Semantic knowledge matching
- Review diff between versions

---

## File Structure (Final)

```
templates/
├── registry.js                    # Extended with review configs
├── charter/
│   ├── review_prompt.txt          # Review system prompt
│   ├── review_rules.json          # Field-specific review criteria
│   └── ... (existing files)
├── knowledge/
│   ├── index.json                 # Knowledge category manifest
│   ├── charter/
│   │   ├── best_practices.json
│   │   ├── checklists.json
│   │   └── anti_patterns.json
│   ├── risk/
│   │   └── common_risks.json
│   └── scope/
│       └── scope_guidelines.json

server/
├── review/
│   ├── engine.js                  # Core review logic
│   ├── Orchestrator.ts            # Interactive review state machine
│   └── dimensions/                # Per-dimension analyzers
│       ├── completeness.js
│       ├── specificity.js
│       └── ...
├── knowledge/
│   ├── loader.js                  # Load knowledge from files
│   ├── query.js                   # Query knowledge by triggers
│   └── inject.js                  # Format for prompt injection

api/
├── documents/
│   ├── review.js                  # POST /api/documents/review
│   └── review-stream.js           # Streaming version
├── assistant/
│   └── review/
│       ├── start.js               # Initiate interactive review
│       └── messages.js            # Handle review conversation

src/
├── components/
│   ├── ReviewPanel.jsx            # Main review display
│   ├── ReviewScoreCard.jsx        # Dimension scores
│   ├── FeedbackItem.jsx           # Individual feedback card
│   └── ReviewSummary.jsx          # Strengths + summary
├── state/
│   └── slices/
│       └── reviewSession.ts       # Review state management

lib/
├── doc/
│   └── review.js                  # Shared review utilities
└── knowledge/
    └── types.ts                   # Knowledge TypeScript types
```

---

## Success Metrics

1. **Adoption**: % of charters reviewed before export
2. **Feedback Quality**: User acceptance rate of feedback items
3. **Score Improvement**: Average score increase after revisions
4. **Time to Quality**: Time from first draft to passing review threshold
5. **Knowledge Utilization**: % of knowledge entries triggered

---

## Open Questions

1. **Caching Strategy**: Should we cache reviews for unchanged documents?
2. **Feedback Persistence**: Store feedback history per document?
3. **Collaborative Review**: Multiple reviewers with consolidated feedback?
4. **Custom Rules**: Allow organizations to add custom review criteria?
5. **Scoring Weights**: Should dimension weights be configurable?

---

## Next Steps

1. Create `api/documents/review.js` endpoint
2. Write charter review prompt template
3. Define initial `review_rules.json`
4. Build `ReviewPanel.jsx` component
5. Seed knowledge database with 10-15 entries
6. Integration test with sample charters
