import { t } from "elysia";

export const UploadClassRecordSchema = t.Object({
	file: t.File({ description: "Class-record .xlsx workbook" }),
	classSectionId: t.String({
		description: "ID of the ClassSection to associate attainments with",
	}),
});

export type UploadClassRecord = typeof UploadClassRecordSchema.static;
