import { Field, FieldLabel } from "@/components/ui/field";
import { Progress, ProgressValue } from "@/components/ui/progress";

const Example = () => (
  <Field className="w-full max-w-xs">
    <Progress value={66}>
      <FieldLabel>Upload progress</FieldLabel>

      <ProgressValue />
    </Progress>
  </Field>
);
