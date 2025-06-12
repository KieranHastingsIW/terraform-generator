
'use client';

/**
 * @fileOverview Service for interacting with Keycloak to fetch a new client ID.
 */

/**
 * Fetches a new client ID from the configured Keycloak endpoint.
 * The endpoint is expected to return a JSON response with a `clientId` property.
 * @returns {Promise<string>} A promise that resolves with the new client ID.
 * @throws {Error} If the request fails or the response format is incorrect.
 */
export async function fetchNewClientId(): Promise<string> {
  const endpointUrl = process.env.NEXT_PUBLIC_KEYCLOAK_CREATE_CLIENT_ENDPOINT_URL;

  if (!endpointUrl) {
    console.error("Keycloak client creation endpoint URL is not configured. Please set NEXT_PUBLIC_KEYCLOAK_CREATE_CLIENT_ENDPOINT_URL in your .env file.");
    throw new Error("Keycloak endpoint not configured.");
  }

  try {
    // In a real application, you might need to send an Authorization header
    // or a request body, depending on your Keycloak endpoint's requirements.
    const response = await fetch(endpointUrl, {
      method: 'POST', // Or 'GET', or whatever your endpoint expects
      headers: {
        'Content-Type': 'application/json',
        // Add any other necessary headers, e.g., Authorization
      },
      // body: JSON.stringify({ /* any necessary payload */ }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Keycloak API request failed with status ${response.status}: ${errorBody}`);
      throw new Error(`Failed to fetch client ID from Keycloak. Status: ${response.status}`);
    }

    const data = await response.json();

    if (data && typeof data.clientId === 'string') {
      return data.clientId;
    } else {
      console.error("Keycloak API response did not contain a valid clientId:", data);
      throw new Error("Invalid response format from Keycloak endpoint.");
    }
  } catch (error) {
    console.error("Error calling Keycloak client creation endpoint:", error);
    if (error instanceof Error && error.message.startsWith('Failed to fetch client ID')) {
      throw error;
    }
    throw new Error("An unexpected error occurred while fetching the client ID.");
  }
}
