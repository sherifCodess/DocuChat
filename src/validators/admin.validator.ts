import { z } from "zod";
import { idSchema } from "./id.validator";

export const assignRoleSchema = z.object({
  params: z.object({
    userId: idSchema("Invalid user ID"),
  }),
  body: z.object({
    roleName: z.string().min(1, "Role name is required"),
  }),
});

export const revokeRoleSchema = z.object({
  params: z.object({
    userId: idSchema("Invalid user ID"),
    roleName: z.string().min(1, "Role name is required"),
  }),
});
