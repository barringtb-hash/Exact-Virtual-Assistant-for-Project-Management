# LLM-Based Document Extraction Strategy

## Executive Summary

This document outlines a comprehensive strategy to revamp the document extraction system from an **intent-driven** model to an **LLM-analysis-driven** model. The new system will automatically analyze uploaded documents, determine their likely use case, present recommendations to users for confirmation, and then extract structured data into document fields.

---

## 1. Current State Analysis

### Current Flow (Intent-Only)
```
User uploads file → User sends intent message → Regex-based intent detection
→ Extraction only if intent matches patterns → Fields populated
```

### Key Limitations
1. **Requires explicit user intent** via specific phrases ("create charter", "update charter")
2. **No automatic document analysis** - system waits for user direction
3. **Regex-based detection** - brittle, misses paraphrased requests
4. **No document type inference** - user must specify target document type
5. **Single extraction path** - cannot suggest alternative document types

---

## 2. Proposed New Flow (LLM-Analysis-Driven)

### New Flow Overview
```
User uploads document
       ↓
┌──────────────────────────────────────┐
│   LLM Document Analysis Pipeline     │
│   ─────────────────────────────────  │
│   1. Content extraction (text/tables)│
│   2. Document type classification    │
│   3. Intent/purpose inference        │
│   4. Field mapping preview           │
│   5. Confidence scoring              │
└──────────────────────────────────────┘
       ↓
System presents analysis to user:
"This appears to be a project scope document.
 I can use it to create a Project Charter.
 Confidence: 87%"
       ↓
User confirms or selects alternative
       ↓
LLM performs full extraction → Fields populated
```

### Core Principles
1. **Analysis-First**: Analyze documents before extraction
2. **User Confirmation**: Always confirm before populating fields
3. **Multi-Document Support**: Infer best-fit document type(s)
4. **Confidence Transparency**: Show users why recommendations were made
5. **Graceful Fallback**: Handle low-confidence scenarios with questions

---

## 3. Architecture Design

### 3.1 New Components

#### A. Document Analysis Service (`/server/documents/analysis/`)

```
server/documents/analysis/
├── DocumentAnalyzer.ts        # Main analysis orchestrator
├── ContentExtractor.ts        # Text/table extraction from files
├── TypeClassifier.ts          # Document type classification
├── IntentInferrer.ts          # Purpose/intent inference
├── FieldMapper.ts             # Preview field mappings
├── ConfidenceScorer.ts        # Confidence calculation
└── types.ts                   # Shared type definitions
```

#### B. Analysis API Endpoint (`/api/documents/analyze.js`)

New endpoint for document analysis:

```typescript
POST /api/documents/analyze
Request:
{
  attachments: Attachment[],      // Uploaded files
  conversationContext?: string[], // Optional chat context
  existingDraft?: object          // Existing document state
}

Response:
{
  status: "analyzed" | "needs_clarification",
  analysis: {
    documentClassification: {
      primaryType: "project_scope" | "meeting_notes" | "requirements" | ...,
      confidence: number,        // 0-1
      signals: string[]          // Why this classification
    },
    suggestedTargets: [{
      docType: "charter" | "ddp" | "sow",
      confidence: number,
      rationale: string,
      previewFields: {           // Preview of extractable data
        project_name?: string,
        vision?: string,
        // ... partial field values
      },
      coverage: {                // What fields can be populated
        available: string[],
        missing: string[],
        inferrable: string[]
      }
    }],
    alternativeTargets?: [{...}],  // Other possible document types
    clarificationQuestions?: string[] // If confidence < threshold
  },
  raw: {
    extractedText: string,
    tables?: object[],
    metadata?: object
  }
}
```

#### C. Confirmation Handler (`/api/documents/confirm.js`)

Processes user confirmation and triggers extraction:

```typescript
POST /api/documents/confirm
Request:
{
  analysisId: string,           // Reference to analysis result
  confirmed: {
    docType: string,            // Confirmed document type
    action: "create" | "update",
    fieldOverrides?: object     // User corrections to preview
  }
}

Response:
{
  status: "extracting" | "extracted",
  extractionId?: string,
  fields?: object               // Extracted fields (if synchronous)
}
```

### 3.2 LLM Prompting Strategy

#### Document Analysis System Prompt

```markdown
# Document Analysis Instructions

You are analyzing an uploaded document to determine its purpose and how it can be used
to populate structured project documents.

## Your Tasks:

1. **Classify the Document**
   - Identify the document type (scope document, meeting notes, requirements spec,
     proposal, contract, email thread, etc.)
   - Identify key structural elements (sections, tables, lists)

2. **Infer Intent**
   - What was this document created for?
   - What project management artifacts could it inform?

3. **Map to Target Documents**
   For each possible target (Charter, DDP, SOW), identify:
   - Which fields can be directly populated
   - Which fields can be inferred with reasoning
   - Which fields are missing and would need user input

4. **Calculate Confidence**
   - High (>80%): Clear document purpose, direct field mappings
   - Medium (50-80%): Some ambiguity, requires inference
   - Low (<50%): Unclear purpose, multiple interpretations

5. **Generate Signals**
   - List specific evidence supporting your classification
   - E.g., "Contains 'Project Scope' heading", "Has milestone table"

## Output Format:
Return a structured JSON analysis following the schema provided.
```

#### Field Extraction System Prompt (Post-Confirmation)

```markdown
# Field Extraction Instructions

The user has confirmed they want to create a {{docType}} from the uploaded document.

## Context:
- Document Classification: {{classification}}
- Confidence: {{confidence}}
- Analysis Signals: {{signals}}

## Your Tasks:

1. **Extract Explicit Values**
   - Pull values directly stated in the document
   - Preserve original wording where appropriate

2. **Infer Implicit Values**
   - Derive values from context when not explicitly stated
   - Mark these as "inferred" with reasoning

3. **Handle Missing Fields**
   - For required fields without values, set to null
   - Provide suggestions for what the user should provide

4. **Normalize Formats**
   - Dates: ISO format (YYYY-MM-DD)
   - Lists: Array of strings
   - Complex objects: Follow schema structure

## Field Rules:
{{fieldRules}}

## Output Format:
Return extracted fields following the {{docType}} schema.
```

### 3.3 Database/State Management

#### Analysis Cache

Store analysis results for confirmation flow:

```typescript
interface AnalysisCache {
  analysisId: string;
  timestamp: Date;
  ttl: number;                    // 15 minutes default
  attachments: AttachmentRef[];
  rawContent: {
    text: string;
    tables: object[];
    metadata: object;
  };
  analysis: AnalysisResult;
  status: "pending" | "confirmed" | "expired";
}
```

#### Implementation Options

1. **In-Memory Store** (for serverless)
   - Use existing pattern from `Orchestrator.ts`
   - Session-keyed Map with TTL cleanup

2. **Redis/Upstash** (for production scale)
   - Add Upstash Redis for distributed state
   - Enable cross-instance analysis sharing

---

## 4. Document Type Classification System

### 4.1 Source Document Types

Classification categories for uploaded documents:

| Category | Examples | Signals |
|----------|----------|---------|
| **Project Scope** | Scope documents, SOWs | "Scope", "In Scope", "Out of Scope" headers |
| **Meeting Notes** | Kickoff notes, status updates | Date headers, attendee lists, action items |
| **Requirements** | BRDs, user stories, specs | "Requirements", "Shall", acceptance criteria |
| **Proposals** | Proposals, pitches | "Proposed", cost tables, timelines |
| **Contracts** | Agreements, NDAs | Legal language, signatures, terms |
| **Email Thread** | Forwarded emails | "From:", "To:", "Subject:" patterns |
| **Presentation** | Slide decks | Slide markers, brief bullet points |
| **Spreadsheet** | Excel data, CSV | Tabular structure, numeric data |
| **Mixed/Unknown** | Ambiguous documents | Low classification confidence |

### 4.2 Target Document Mapping

| Source Type | Primary Target | Secondary Targets |
|-------------|---------------|-------------------|
| Project Scope | Charter | DDP, SOW |
| Meeting Notes | Charter (updates) | DDP |
| Requirements | DDP | Charter |
| Proposals | Charter | SOW |
| Contracts | SOW | Charter |
| Email Thread | Charter (context) | - |
| Presentation | Charter | DDP |
| Spreadsheet | DDP (data) | Charter (milestones) |

### 4.3 Classification Implementation

```typescript
// TypeClassifier.ts

interface ClassificationResult {
  primaryType: SourceDocumentType;
  confidence: number;
  signals: ClassificationSignal[];
  alternativeTypes: Array<{
    type: SourceDocumentType;
    confidence: number;
  }>;
}

interface ClassificationSignal {
  type: "keyword" | "structure" | "pattern" | "semantic";
  evidence: string;
  weight: number;
}

async function classifyDocument(content: ExtractedContent): Promise<ClassificationResult> {
  // 1. Structural analysis (fast, deterministic)
  const structuralSignals = analyzeStructure(content);

  // 2. Keyword analysis (fast, deterministic)
  const keywordSignals = analyzeKeywords(content);

  // 3. Semantic analysis (LLM-based, nuanced)
  const semanticSignals = await analyzeSemantically(content);

  // 4. Combine signals with weighted scoring
  return combineSignals([structuralSignals, keywordSignals, semanticSignals]);
}
```

---

## 5. User Confirmation Workflow

### 5.1 Confirmation UI States

```
┌─────────────────────────────────────────────────────────────────────┐
│  Document Analysis Complete                                          │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  📄 Uploaded: project_scope_v2.docx                                 │
│                                                                      │
│  I analyzed your document and found:                                 │
│  • Type: Project Scope Document                                      │
│  • Purpose: Defines project boundaries and deliverables              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Recommended: Create Project Charter                         │    │
│  │  Confidence: 87%                                             │    │
│  │                                                              │    │
│  │  I can populate these fields:                                │    │
│  │  ✓ Project Name: "Customer Portal Redesign"                  │    │
│  │  ✓ Vision: "Modernize customer-facing portal..."             │    │
│  │  ✓ Scope (In): 4 items found                                 │    │
│  │  ✓ Scope (Out): 2 items found                                │    │
│  │  ✓ Milestones: 3 phases identified                           │    │
│  │  ○ Sponsor: Not found (will ask)                             │    │
│  │  ○ Start Date: Inferred as Q1 2025 (will confirm)            │    │
│  │                                                              │    │
│  │  [Create Charter] [Edit First] [Choose Different Type]       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Other options:                                                      │
│  • Design & Development Plan (62% match)                             │
│  • Statement of Work (45% match)                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Confirmation Response Patterns

#### High Confidence (>80%)
```
"This looks like a project scope document. I can create a Project Charter
from it and populate 12 of 15 fields. Should I proceed?"

[Create Charter] [Show Preview] [Choose Different]
```

#### Medium Confidence (50-80%)
```
"This document contains project information, but I'm not entirely sure
of its purpose. It could be used for:

1. Project Charter (68% match) - Good for scope and vision
2. Design & Development Plan (54% match) - Good for requirements

Which would you like to create?"

[Create Charter] [Create DDP] [Tell Me More]
```

#### Low Confidence (<50%)
```
"I've analyzed your document but I'm not confident about the best use.
Can you help me understand:

1. What is this document? (e.g., meeting notes, proposal, requirements)
2. What would you like to create from it?

This will help me extract the right information."

[User text input field]
```

### 5.3 State Machine

```
                    ┌─────────────┐
                    │   IDLE      │
                    └──────┬──────┘
                           │ upload
                           ▼
                    ┌─────────────┐
                    │  ANALYZING  │
                    └──────┬──────┘
                           │ analysis complete
                           ▼
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
     ┌────────────────┐       ┌────────────────┐
     │ AWAITING_      │       │ NEEDS_         │
     │ CONFIRMATION   │       │ CLARIFICATION  │
     └───────┬────────┘       └───────┬────────┘
             │                        │
             │ confirm                │ user response
             │                        │
             ▼                        │
     ┌────────────────┐               │
     │  EXTRACTING    │◄──────────────┘
     └───────┬────────┘
             │ extraction complete
             ▼
     ┌────────────────┐
     │  COMPLETE      │
     └────────────────┘
```

---

## 6. Field Mapping Architecture

### 6.1 Two-Phase Extraction

**Phase 1: Preview Extraction (Lightweight)**
- Run during analysis
- Extract only key fields for preview
- Fast response (<2 seconds)
- Show user what will be populated

**Phase 2: Full Extraction (Comprehensive)**
- Run after user confirmation
- Extract all fields with validation
- Apply normalization rules
- Generate extraction confidence per field

### 6.2 Field Confidence Scoring

```typescript
interface FieldExtractionResult {
  fieldId: string;
  value: any;
  confidence: "high" | "medium" | "low";
  source: "explicit" | "inferred" | "default";
  evidence?: string;           // Where in document
  reasoning?: string;          // Why this value (for inferred)
  alternatives?: any[];        // Other possible values
}
```

### 6.3 Extraction Strategies per Field Type

| Field Type | Strategy |
|------------|----------|
| **project_name** | Look for titles, headers, "Project:" labels |
| **sponsor/lead** | Look for role labels, signature blocks, "Prepared by" |
| **dates** | Parse date patterns, relative dates ("Q1 2025") |
| **vision/problem** | Extract from overview, executive summary sections |
| **scope_in/out** | Look for bulleted lists under scope headers |
| **risks/assumptions** | Look for explicit sections or infer from constraints |
| **milestones** | Parse tables, timeline sections, phase descriptions |
| **success_metrics** | Look for KPIs, metrics, success criteria sections |
| **core_team** | Parse team tables, role assignments |

---

## 7. Implementation Phases

### Phase 1: Document Analysis Foundation (Week 1-2)
**Files to Create/Modify:**

```
CREATE:
├── server/documents/analysis/
│   ├── DocumentAnalyzer.ts
│   ├── ContentExtractor.ts
│   ├── TypeClassifier.ts
│   └── types.ts
├── api/documents/analyze.js
└── tests/analysis/

MODIFY:
├── templates/registry.js       # Add analysis prompts
└── server/config/extraction.js # Add analysis config
```

**Deliverables:**
- [ ] Content extraction from uploaded files (text, tables)
- [ ] Basic document type classification
- [ ] Analysis API endpoint
- [ ] Unit tests for classification

### Phase 2: LLM Integration for Analysis (Week 3-4)
**Files to Create/Modify:**

```
CREATE:
├── server/documents/analysis/
│   ├── IntentInferrer.ts
│   ├── FieldMapper.ts
│   └── ConfidenceScorer.ts
├── templates/prompts/
│   ├── document_analysis.txt
│   └── type_classification.txt

MODIFY:
├── server/documents/openai/client.js  # Add analysis methods
└── templates/registry.js              # Add analysis config per type
```

**Deliverables:**
- [ ] LLM-powered semantic analysis
- [ ] Intent inference from document content
- [ ] Preview field mapping
- [ ] Confidence scoring algorithm

### Phase 3: User Confirmation Flow (Week 5-6)
**Files to Create/Modify:**

```
CREATE:
├── api/documents/confirm.js
├── src/features/analysis/
│   ├── AnalysisResultCard.tsx
│   ├── ConfirmationDialog.tsx
│   ├── FieldPreview.tsx
│   └── useDocumentAnalysis.ts
├── src/state/slices/analysisSlice.ts

MODIFY:
├── src/App.jsx                # Add analysis flow
├── src/chat/ChatInput.tsx     # Handle file upload → analysis
└── src/components/FileUpload  # Trigger analysis on upload
```

**Deliverables:**
- [ ] Analysis result UI component
- [ ] Confirmation dialog with options
- [ ] Field preview display
- [ ] State management for analysis flow
- [ ] E2E tests for confirmation flow

### Phase 4: Full Extraction Integration (Week 7-8)
**Files to Create/Modify:**

```
MODIFY:
├── api/documents/extract.js   # Accept confirmed analysis
├── server/charter/extractFieldsFromUtterance.ts  # Use analysis context
├── server/documents/extraction/guided.js
├── src/features/charter/      # Connect to new flow

CREATE:
├── server/documents/analysis/AnalysisCache.ts
├── templates/prompts/
│   └── field_extraction_with_context.txt
```

**Deliverables:**
- [ ] Analysis-informed extraction
- [ ] Analysis caching with TTL
- [ ] Extraction confidence per field
- [ ] Field-level source attribution
- [ ] Integration tests

### Phase 5: Migration & Cleanup (Week 9-10)
**Files to Modify/Remove:**

```
MODIFY:
├── src/utils/detectCharterIntent.js  # Keep as fallback
├── docs/ARCHITECTURE.md              # Update documentation
├── docs/document-workflow.md         # Update flow diagrams
└── CLAUDE.md                         # Update instructions

DEPRECATE (but keep for fallback):
├── Intent-only extraction path
└── Regex-based intent detection
```

**Deliverables:**
- [ ] Feature flag for new vs old flow
- [ ] Migration guide for existing users
- [ ] Updated documentation
- [ ] Performance benchmarks
- [ ] Rollback plan

---

## 8. API Contract Changes

### New Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/documents/analyze` | POST | Analyze uploaded document |
| `/api/documents/confirm` | POST | Confirm analysis and trigger extraction |
| `/api/documents/analysis/:id` | GET | Get cached analysis result |
| `/api/documents/analysis/:id` | DELETE | Clear cached analysis |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `/api/documents/extract` | Accept `analysisId` to use cached analysis |

### Request/Response Schemas

See Section 3.1 for detailed schemas.

---

## 9. Configuration & Feature Flags

### New Environment Variables

```bash
# Analysis Configuration
DOCUMENT_ANALYSIS_ENABLED=true
ANALYSIS_CACHE_TTL_SECONDS=900           # 15 minutes
ANALYSIS_CONFIDENCE_THRESHOLD=0.5        # Minimum for auto-suggest
ANALYSIS_AUTO_EXTRACT_THRESHOLD=0.9      # Auto-extract if very confident

# LLM Configuration
ANALYSIS_MODEL=gpt-4o                    # Model for analysis
ANALYSIS_TEMPERATURE=0.3                 # Lower for consistency
EXTRACTION_MODEL=gpt-4o-mini             # Model for extraction
```

### Feature Flags

```javascript
// config/featureFlags.js

export function isDocumentAnalysisEnabled() {
  return process.env.DOCUMENT_ANALYSIS_ENABLED === "true";
}

export function shouldAutoExtractHighConfidence() {
  return parseFloat(process.env.ANALYSIS_AUTO_EXTRACT_THRESHOLD) || 0.9;
}

// Fallback to old flow if analysis disabled
export function getExtractionMode() {
  if (isDocumentAnalysisEnabled()) {
    return "analysis-driven";
  }
  return "intent-driven"; // Legacy mode
}
```

---

## 10. Testing Strategy

### Unit Tests
- Document type classification accuracy
- Confidence score calculation
- Field mapping preview generation
- Analysis caching behavior

### Integration Tests
- Full analysis → confirmation → extraction flow
- Multi-document analysis
- Low confidence handling
- Error recovery

### E2E Tests (Cypress/Playwright)
- Upload document → see analysis → confirm → view fields
- Change document type selection
- Handle ambiguous documents
- Mobile responsiveness

### Golden Tests
- Sample documents with expected classifications
- Expected field extractions per document type
- Regression testing for extraction quality

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM hallucinations in analysis | Medium | Confidence scoring, user confirmation required |
| Slow analysis response | High | Streaming responses, optimistic UI updates |
| Incorrect document classification | Medium | Always show alternatives, allow override |
| Cost increase from double LLM calls | Medium | Cache analysis, optimize prompts |
| User confusion with new flow | Medium | Clear UI, guided onboarding |
| Breaking existing integrations | High | Feature flag, maintain legacy endpoint |

---

## 12. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Analysis accuracy | >85% | User confirmation rate of primary suggestion |
| Extraction quality | >90% | Fields accepted without manual edit |
| User satisfaction | >4.0/5 | Post-extraction survey |
| Time to first field | <5s | Latency from upload to preview |
| Fallback rate | <10% | Users needing to manually specify intent |

---

## 13. File Structure Summary

### New Files to Create

```
server/documents/analysis/
├── DocumentAnalyzer.ts          # Main orchestrator
├── ContentExtractor.ts          # File content extraction
├── TypeClassifier.ts            # Document classification
├── IntentInferrer.ts            # Purpose inference
├── FieldMapper.ts               # Preview field mapping
├── ConfidenceScorer.ts          # Confidence calculation
├── AnalysisCache.ts             # Caching layer
└── types.ts                     # Type definitions

api/documents/
├── analyze.js                   # Analysis endpoint
└── confirm.js                   # Confirmation endpoint

src/features/analysis/
├── AnalysisResultCard.tsx       # Analysis display
├── ConfirmationDialog.tsx       # User confirmation
├── FieldPreview.tsx             # Field preview
├── AlternativeOptions.tsx       # Other document types
└── useDocumentAnalysis.ts       # React hook

src/state/slices/
└── analysisSlice.ts             # Analysis state management

templates/prompts/
├── document_analysis.txt        # Analysis system prompt
├── type_classification.txt      # Classification prompt
└── field_extraction_context.txt # Context-aware extraction

tests/
├── analysis/                    # Unit tests
├── integration/analysis/        # Integration tests
└── e2e/analysis/               # E2E tests
```

### Files to Modify

```
api/documents/extract.js         # Accept analysisId
server/documents/openai/client.js # Add analysis methods
templates/registry.js            # Add analysis config
src/App.jsx                      # Add analysis flow
src/chat/ChatInput.tsx           # Trigger analysis on upload
config/featureFlags.js           # Add analysis flags
docs/ARCHITECTURE.md             # Update documentation
```

---

## 14. Next Steps

1. **Review this strategy** with stakeholders
2. **Finalize scope** for Phase 1
3. **Set up feature flag** for gradual rollout
4. **Create detailed tickets** for each phase
5. **Begin Phase 1 implementation**

---

*Document Version: 1.0*
*Created: 2024*
*Status: Draft - Pending Review*
