/**
---
scenario: Application smoke validation
feature: platform
subsystem: shell
envs: [guided, wizard]
risk: medium
owner: "@qa-team"
ci_suites: [e2e-guided, e2e-wizard]
flaky: false
needs_review: false
preconditions:
  - Application build assets available
  - Cypress env configuration for smoke checks
data_setup: None
refs: [CI]
---
*/

describe('EVSPM smoke', () => {
  it('loads app and template assets', () => {
    cy.visit('/')
    cy.request('/templates/charter/manifest.json').its('status').should('eq', 200)
    cy.request('/templates/charter/schema.json').its('status').should('eq', 200)
    cy.contains('Chat Assistant').should('exist')
  })
})
