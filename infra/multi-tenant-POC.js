const { ManagedIdentityCredential, ClientAssertionCredential } = require("@azure/identity");

module.exports = async function (context, req) {
const results = [];
const clientTenantId = "d5d11700-4c7c-463f-83e3-c6f26e4502c8";

try {
    results.push("Step 1: Getting MSI assertion...");
    const msiCredential = new ManagedIdentityCredential();

    results.push("Step 2: Creating federated credential for client tenant...");
    const clientId = process.env.AZURE_CLIENT_ID;
    results.push("App Client ID: " + clientId);
    results.push("Target Tenant: " + clientTenantId);

    const federatedCredential = new ClientAssertionCredential(
    clientTenantId,  // Target the CLIENT tenant, not MSP
    clientId,
    async () => (await msiCredential.getToken("api://AzureADTokenExchange")).token
    );

    results.push("Step 3: Getting Graph token for client tenant...");
    const graphToken = await federatedCredential.getToken("https://graph.microsoft.com/.default");
    results.push("Graph token acquired");

    results.push("Step 4: Fetching tenant info...");
    const response = await fetch("https://graph.microsoft.com/v1.0/organization", {
    headers: { Authorization: "Bearer " + graphToken.token }
    });
    const data = await response.json();

    const tenantName = data.value?.[0]?.displayName || "Unknown";
    results.push("Tenant Name: " + tenantName);

    context.res = {
    body: results.join("\n") + "\n\n--- SUCCESS ---\nConnected to: " + tenantName
    };
} catch (error) {
    results.push("\nERROR: " + error.message);
    context.res = { status: 500, body: results.join("\n") };
}
};