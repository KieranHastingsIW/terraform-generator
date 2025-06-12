
import type { ProfileConfiguratorValues } from './profile-configurator-schema';

export type TerraformGenerationOutput = {
  fullTerraformConfig: string;
  ownerIdMapping?: string; // Content of the mapping file: "Instance X (Queue Y): OwnerID_Z"
};

/**
 * Sanitizes a string for use as a Terraform resource name.
 * Converts to lowercase, replaces non-alphanumeric characters (excluding underscore) with underscores,
 * and removes leading/trailing underscores.
 * @param name The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeForTerraformResourceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Converts only the ">" character in a topic string to its Unicode escape sequence "\\u003e".
 * All other characters are preserved as is.
 * @param topicValue The topic string.
 * @returns The topic string with ">" converted.
 */
function convertTopicToUnicodeEscaped(topicValue: string): string {
  let result = '';
  for (const char of topicValue) {
    if (char === '>') {
      result += '\\u003e';
    } else {
      result += char;
    }
  }
  return result;
}

function generatePaddedSuffix(instanceNumber: number, totalInstances: number): string {
  if (totalInstances <= 1) return '';
  // Pad with leading zeros to make it 3 digits, e.g., _001, _010, _123
  return `_${String(instanceNumber).padStart(3, '0')}`;
}


export function generateTerraformConfig(
  input: ProfileConfiguratorValues,
  fetchedOwnerIdsForInstances?: string[] // Used when numberOfInstances > 1 and type is subscriber
): TerraformGenerationOutput {
  const numInstances = input.numberOfInstances ?? 1;
  let aggregatedFullTerraformConfig = '';
  let ownerIdMappingResult = '';

  const msgVpnNameValue = "solacebroker_msg_vpn.NEMS_01.msg_vpn_name";

  for (let i = 1; i <= numInstances; i++) {
    const instanceSuffix = generatePaddedSuffix(i, numInstances);

    const instanceAclProfileName = `${input.aclProfileName}${instanceSuffix}`;
    const instanceAuthProfileName = `${input.authProfileName}${instanceSuffix}`;
    const instanceQueueName = input.queueName ? `${input.queueName}${instanceSuffix}` : undefined;
    
    // Determine the ownerId for the current instance
    let currentOwnerId = input.ownerId; // Default for single instance or publisher
    if (input.applicationType === "subscriber" && numInstances > 1 && fetchedOwnerIdsForInstances && fetchedOwnerIdsForInstances[i - 1]) {
      currentOwnerId = fetchedOwnerIdsForInstances[i - 1];
      if (currentOwnerId && !currentOwnerId.startsWith("ErrorFetchingID_")) { // Only map valid IDs
         ownerIdMappingResult += `Instance ${i} (ACL: ${instanceAclProfileName}${instanceQueueName ? ", Queue: " + instanceQueueName : ""}): ${currentOwnerId}\n`;
      } else if (currentOwnerId && currentOwnerId.startsWith("ErrorFetchingID_")) {
         ownerIdMappingResult += `Instance ${i} (ACL: ${instanceAclProfileName}${instanceQueueName ? ", Queue: " + instanceQueueName : ""}): Error - ID not fetched\n`;
      }
    }


    const sanitizedAclProfileName = sanitizeForTerraformResourceName(instanceAclProfileName);
    const sanitizedAuthProfileName = sanitizeForTerraformResourceName(instanceAuthProfileName);
    const sanitizedQueueName = instanceQueueName ? sanitizeForTerraformResourceName(instanceQueueName) : undefined;

    const aclProfileResource = `
resource "solacebroker_msg_vpn_acl_profile" "${sanitizedAclProfileName}" {
  acl_profile_name                     = "${instanceAclProfileName}"
  client_connect_default_action        = "allow"
  msg_vpn_name                         = ${msgVpnNameValue}
  subscribe_share_name_default_action  = "disallow"
}`.trim();

    const clientProfileNameValue = input.applicationType === "publisher"
      ? "solacebroker_msg_vpn_client_profile.NEMS_01_publisher-client-profile.client_profile_name"
      : "solacebroker_msg_vpn_client_profile.NEMS_01_subscriber-client-profile.client_profile_name";

    const authGroupResource = `
resource "solacebroker_msg_vpn_authorization_group" "${sanitizedAuthProfileName}" {
  acl_profile_name          = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
  authorization_group_name  = "${instanceAuthProfileName}"
  client_profile_name       = ${clientProfileNameValue}
  enabled                   = true
  msg_vpn_name              = ${msgVpnNameValue}
}`.trim();

    const topicExceptionResources: string[] = [];
    if (input.applicationType === "publisher") {
      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedAclProfileName}_publish_exception_${index}`;
        const exceptionResource = `
resource "solacebroker_msg_vpn_acl_profile_publish_topic_exception" "${resourceName}" {
  acl_profile_name                = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
  msg_vpn_name                    = ${msgVpnNameValue}
  publish_topic_exception         = "${convertedTopicValue}"
  publish_topic_exception_syntax  = "smf"
}`.trim();
        topicExceptionResources.push(exceptionResource);
      });
    } else if (input.applicationType === "subscriber") {
      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedAclProfileName}_subscribe_exception_${index}`;
        const exceptionResource = `
resource "solacebroker_msg_vpn_acl_profile_subscribe_topic_exception" "${resourceName}" {
  acl_profile_name                  = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
  msg_vpn_name                      = ${msgVpnNameValue}
  subscribe_topic_exception         = "${convertedTopicValue}"
  subscribe_topic_exception_syntax  = "smf"
}`.trim();
        topicExceptionResources.push(exceptionResource);
      });
    }

    let queueResource: string | undefined = undefined;
    const queueSubscriptionResources: string[] = [];

    if (input.applicationType === "subscriber" && instanceQueueName && sanitizedQueueName && currentOwnerId && !currentOwnerId.startsWith("ErrorFetchingID_")) {
      queueResource = `
resource "solacebroker_msg_vpn_queue" "${sanitizedQueueName}" {
  egress_enabled                                 = true
  event_bind_count_threshold                     = { clear_percent = 60, set_percent = 80 }
  event_msg_spool_usage_threshold                = { clear_percent = 18, set_percent = 25 }
  event_reject_low_priority_msg_limit_threshold  = { clear_percent = 60, set_percent = 80 }
  ingress_enabled                                = true
  max_msg_size                                   = 1e+06
  max_msg_spool_usage                            = 500
  msg_vpn_name                                   = ${msgVpnNameValue}
  owner                                          = "${currentOwnerId}"
  queue_name                                     = "${instanceQueueName}"
}`.trim();

      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedQueueName}_subscription_${index}`;
        const subscriptionResource = `
resource "solacebroker_msg_vpn_queue_subscription" "${resourceName}" {
  msg_vpn_name        = ${msgVpnNameValue}
  queue_name          = solacebroker_msg_vpn_queue.${sanitizedQueueName}.queue_name
  subscription_topic  = "${convertedTopicValue}"
}`.trim();
        queueSubscriptionResources.push(subscriptionResource);
      });
    }

    const instanceTerraformResources = [
      aclProfileResource,
      authGroupResource,
      ...topicExceptionResources
    ];
    if (queueResource) {
      instanceTerraformResources.push(queueResource);
    }
    if (queueSubscriptionResources.length > 0) {
      instanceTerraformResources.push(...queueSubscriptionResources);
    }

    aggregatedFullTerraformConfig += instanceTerraformResources.join('\n\n');
    if (numInstances > 1 && i < numInstances) {
      aggregatedFullTerraformConfig += '\n\n\n# --- Next Profile Instance ---\n\n';
    }
  }

  return {
    fullTerraformConfig: aggregatedFullTerraformConfig,
    ownerIdMapping: ownerIdMappingResult.trim() || undefined,
  };
}
