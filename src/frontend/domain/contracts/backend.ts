import type { RequestContext } from "./providers";
import type {
  BackendRun,
  BackendStatus,
  ObjectiveValidation,
  SourceInventory,
} from "../models/backend";

export interface BackendProvider {
  getStatus(context: RequestContext): Promise<BackendStatus>;
  getSources(context: RequestContext): Promise<SourceInventory>;
  validateObjective(
    text: string,
    context: RequestContext,
  ): Promise<ObjectiveValidation>;
  getRun(id: string, context: RequestContext): Promise<BackendRun>;
}
