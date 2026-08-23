import type { ComponentProps } from "react";
import ImportPreviewSummary from "../../../components/ImportPreviewSummary";

type ImportValidationSummaryProps = ComponentProps<typeof ImportPreviewSummary>;

/** Feature-owned boundary for the validation summary used by the import workspace. */
export default function ImportValidationSummary(props: ImportValidationSummaryProps) {
  return <ImportPreviewSummary {...props} />;
}
