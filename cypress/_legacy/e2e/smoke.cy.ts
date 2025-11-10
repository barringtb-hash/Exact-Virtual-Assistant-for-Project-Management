describe('EVSPM smoke', () => {
  it('loads app and template assets', () => {
    cy.visit('/')
    cy.request('/templates/charter/manifest.json').its('status').should('eq', 200)
    cy.request('/templates/charter/schema.json').its('status').should('eq', 200)
    cy.contains('Chat Assistant').should('exist')
  })
})
