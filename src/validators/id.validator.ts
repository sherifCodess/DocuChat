import { z } from "zod";

// Model IDs are cuid() by default (Day 2). Legacy uuid IDs are also accepted.
export const idSchema = (message: string) =>
  z.union([z.cuid(), z.uuid()], { error: message });
