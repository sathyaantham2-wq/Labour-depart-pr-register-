import { z } from "zod";
import { CASE_STATUSES } from "@/components/cases/constants";

export const createCaseSchema = z.object({
  file_number: z.string().trim().min(1, "Enter a file number.").max(100),
  act: z.string().trim().min(1, "Enter the Act.").max(100),
  received_date: z.string().trim().min(1, "Enter the received date."),
  memo_number: z.string().trim().max(100).optional().or(z.literal("")),
  subject: z.string().trim().max(500).optional().or(z.literal("")),
  received_from_id: z.string().uuid("Select a Received From.").optional().or(z.literal("")),
  section_id: z.string().uuid("Select a Section.").optional().or(z.literal("")),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const editCaseSchema = z
  .object({
    received_from_id: z.string().uuid("Select a Received From.").optional().or(z.literal("")),
    section_id: z.string().uuid("Select a Section.").optional().or(z.literal("")),
    status: z.enum(CASE_STATUSES),
    forwarded_to: z.string().trim().max(200).optional().or(z.literal("")),
    amount_recovered: z.string().trim().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.status === "forwarded" && !data.forwarded_to) {
      ctx.addIssue({
        code: "custom",
        path: ["forwarded_to"],
        message: "Enter who the case was forwarded to.",
      });
    }
  });
export type EditCaseInput = z.infer<typeof editCaseSchema>;
