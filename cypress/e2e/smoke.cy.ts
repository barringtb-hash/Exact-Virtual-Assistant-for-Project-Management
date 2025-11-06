describe('EVSPM smoke', () => {
  it('loads app and template assets', () => {
    cy.visit('/')
    cy.ensureAppReady()
    cy.request('/templates/charter/manifest.json').its('status').should('eq', 200)
    cy.request('/templates/charter/schema.json').its('status').should('eq', 200)
    cy.get('[data-testid="chat-root"]').should('exist')
  })
})
