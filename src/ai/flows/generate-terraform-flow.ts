
'use server';
/**
 * @fileOverview Generates Terraform configuration for Solace resources.
 *
 * - generateTerraform - A function that handles the Terraform code generation.
 * - TerraformGenerationInput - The input type for the generateTerraform function (matches ProfileConfiguratorValues).
 * - TerraformGenerationOutput - The return type for the generateTerraform function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { profileConfiguratorSchema, type ProfileConfiguratorValues } from '@/lib/profile-configurator-schema';

export type TerraformGenerationInput = ProfileConfiguratorValues;

const TerraformGenerationOutputSchema = z.object({
  aclProfileResource: z.string(),
  authGroupResource: z.string(),
  publishTopicExceptionResources: z.array(z.string()),
  fullTerraformConfig: z.string(),
});
export type TerraformGenerationOutput = z.infer<typeof TerraformGenerationOutputSchema>;

/**
 * Sanitizes a string for use as a Terraform resource name.
 * Converts to lowercase, replaces non-alphanumeric characters with underscores,
 * and removes leading/trailing underscores.
 * @param name The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeForTerraformResourceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_') // Replace non-alphanumeric (excluding _) with _
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
}

/**
 * Converts a topic string by Unicode-escaping non-alphanumeric characters.
 * ASCII letters and digits are kept as is. Other characters are converted to \uXXXX.
 * @param topicValue The topic string.
 * @returns The Unicode-escaped topic string.
 */
function convertTopicToUnicodeEscaped(topicValue: string): string {
  let result = '';
  for (const char of topicValue) {
    if (/[a-zA-Z0-9]/.test(char)) {
      result += char;
    } else {
      const unicodeHex = char.charCodeAt(0).toString(16).padStart(4, '0');
      result += `\\u${unicodeHex}`;
    }
  }
  return result;
}

export async function generateTerraform(input: TerraformGenerationInput): Promise<TerraformGenerationOutput> {
  return generateTerraformFlow(input);
}

const generateTerraformFlow = ai.defineFlow(
  {
    name: 'generateTerraformFlow',
    inputSchema: profileConfiguratorSchema, // Use the schema from lib
    outputSchema: TerraformGenerationOutputSchema,
  },
  async (input: TerraformGenerationInput) => {
    const sanitizedAclProfileName = sanitizeForTerraformResourceName(input.aclProfileName);
    const sanitizedAuthProfileName = sanitizeForTerraformResourceName(input.authProfileName);

    const aclProfileResource = `
resource "solacebroker_msg_vpn_acl_profile" "${sanitizedAclProfileName}" {
  acl_profile_name                     = "${input.aclProfileName}"
  client_connect_default_action        = "allow"
  msg_vpn_name                         =  ""
  subscribe_share_name_default_action  = "disallow"
}`.trim();

    const authGroupResource = `
resource "solacebroker_msg_vpn_authorization_group" "${sanitizedAuthProfileName}" {
  acl_profile_name          = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
  authorization_group_name  = "${input.authProfileName}"
  client_profile_name       = ""
  enabled                   = true
  msg_vpn_name              = ""
}`.trim();

    const publishTopicExceptionResources: string[] = [];
    if (input.applicationType === "publisher") {
      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        // Ensure unique resource name for each topic exception
        const resourceName = `${sanitizedAclProfileName}-publish_exception_${index}`;
        const exceptionResource = `
resource "solacebroker_msg_vpn_acl_profile_publish_topic_exception" "${resourceName}" {
  acl_profile_name                = "${input.aclProfileName}"
  msg_vpn_name                    = ""
  publish_topic_exception         = "${convertedTopicValue}"
  publish_topic_exception_syntax  = "smf"
}`.trim();
        publishTopicExceptionResources.push(exceptionResource);
      });
    }

    const allResources = [aclProfileResource, authGroupResource, ...publishTopicExceptionResources];
    const fullTerraformConfig = allResources.join('\n\n');

    return {
      aclProfileResource,
      authGroupResource,
      publishTopicExceptionResources,
      fullTerraformConfig,
    };
  }
);
