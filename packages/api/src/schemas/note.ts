import { z } from "zod";

const noteUserSchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    image: z.string().nullable(),
  })
  .nullable();

export const noteSchema = z.object({
  publicId: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.date(),
  updatedAt: z.date().nullable(),
  user: noteUserSchema.optional(),
});

export const noteDeleteResponseSchema = z.object({
  success: z.boolean(),
});

export const noteAppendDailyResponseSchema = z.object({
  note: noteSchema.omit({ user: true }),
  created: z.boolean(),
});
