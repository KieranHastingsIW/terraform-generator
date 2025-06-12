
import { z } from "zod";

export const profileConfiguratorSchema = z.object({
  applicationType: z.enum(["publisher", "subscriber"], {
    required_error: "Application type is required.",
  }),
  authProfileName: z.string().min(1, "Auth Profile name is required."),
  aclProfileName: z.string().min(1, "ACL Profile name is required."),
  queueName: z.string().optional(),
  ownerId: z.string().optional(), // Now optional for schema, refined below
  topics: z.array(z.object({ value: z.string().min(1, "Topic cannot be empty.") })).min(1, "At least one topic is required."),
  numberOfInstances: z.number().int().min(1, "Number of instances must be at least 1.").optional(),
}).refine(data => {
  if (data.applicationType === "subscriber" && (!data.numberOfInstances || data.numberOfInstances === 1)) {
    return data.queueName && data.queueName.trim().length > 0;
  }
  return true;
}, {
  message: "Queue Name is required for a single subscriber instance.",
  path: ["queueName"],
}).refine(data => {
  if (data.applicationType === "subscriber" && (!data.numberOfInstances || data.numberOfInstances === 1)) {
    return data.ownerId && data.ownerId.trim().length > 0 && data.ownerId !== "Error fetching ID";
  }
  return true;
}, {
  message: "Owner ID is required and must be valid for a single subscriber instance.",
  path: ["ownerId"],
});

export type ProfileConfiguratorValues = z.infer<typeof profileConfiguratorSchema>;
