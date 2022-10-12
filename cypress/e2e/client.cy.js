describe('client recording spec', () => {
	beforeEach(() => {
		// Assign aliases to GraphQL requests based on operation name.
		cy.intercept('POST', '/public', (req) => {
			req.alias = req.body.operationName
		})
	})

	it('fetch requests are recorded', () => {
		cy.visit('/')
		cy.window().then((win) => {
			cy.wait('@PushPayload', { timeout: 30 * 1000 })
				.its('request.body.variables')
				.should('have.property', 'resources')

			win.eval(`fetch(new URL('https://localhost:3000/index.html'))`)
			win.eval(
				`fetch(new URL('https://localhost:3000/index.html'), {method: 'POST'})`,
			)
			win.eval(`fetch('https://localhost:3000/index.html')`)
			win.eval(
				`fetch('https://localhost:3000/index.html', {method: 'POST'})`,
			)

			cy.wait('@PushPayload')
				.its('request.body.variables')
				.should('have.property', 'resources')
		})
	})
})