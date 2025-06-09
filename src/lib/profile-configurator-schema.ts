
import { z } from "zod";

export const profileConfiguratorSchema = z.object({
  applicationType: z.enum(["publisher", "subscriber"], {
    required_error: "Application type is required.",
  }),
  authProfileName: z.string().min(1, "Auth Profile name is required."),
  aclProfileName: z.string().min(1, "ACL Profile name is required."),
  queueName: z.string().optional(),
  ownerId: z.string().optional(),
  topics: z.array(z.object({ value: z.string().min(1, "Topic cannot be empty.") })).min(1, "At least one topic is required."),
}).refine(data => {
  if (data.applicationType === "subscriber") {
    return data.queueName && data.queueName.trim().length > 0;
  }
  return true;
}, {
  message: "Queue Name is required for subscriber application type.",
  path: ["queueName"],
}).refine(data => {
  if (data.applicationType === "subscriber") {
    return data.ownerId && data.ownerId.trim().length > 0;
  }
  return true;
}, {
  message: "Owner ID is required for subscriber application type.",
  path: ["ownerId"],
});

export type ProfileConfiguratorValues = z.infer<typeof profileConfiguratorSchema>;
