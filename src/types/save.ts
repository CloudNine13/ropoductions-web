/**
 * Save file and slot definitions for RPG Maker MZ Web Bridge.
 */

export type SaveSlotName = `file${number}` | "global" | "config";

export interface SaveSlotsPayload {
  slots: Record<string, string>;
  global?: string;
  config?: string;
}

export type SaveBridgeMessageType =
  | "ROPODUCTIONS_GET_SAVES"
  | "ROPODUCTIONS_SAVES_DATA"
  | "ROPODUCTIONS_SET_SAVES"
  | "ROPODUCTIONS_SET_SAVES_SUCCESS"
  | "ROPODUCTIONS_RESET_SAVES"
  | "ROPODUCTIONS_RESET_SAVES_SUCCESS"
  | "ROPODUCTIONS_SAVE_ERROR";

export interface GetSavesRequest {
  type: "ROPODUCTIONS_GET_SAVES";
}

export interface SetSavesRequest {
  type: "ROPODUCTIONS_SET_SAVES";
  payload: Record<string, string>;
}

export interface ResetSavesRequest {
  type: "ROPODUCTIONS_RESET_SAVES";
}

export type SaveBridgeRequest =
  | GetSavesRequest
  | SetSavesRequest
  | ResetSavesRequest;

export interface SavesDataResponse {
  type: "ROPODUCTIONS_SAVES_DATA";
  payload: SaveSlotsPayload;
}

export interface SetSavesSuccessResponse {
  type: "ROPODUCTIONS_SET_SAVES_SUCCESS";
}

export interface ResetSavesSuccessResponse {
  type: "ROPODUCTIONS_RESET_SAVES_SUCCESS";
}

export interface SaveErrorResponse {
  type: "ROPODUCTIONS_SAVE_ERROR";
  error: string;
}

export type SaveBridgeResponse =
  | SavesDataResponse
  | SetSavesSuccessResponse
  | ResetSavesSuccessResponse
  | SaveErrorResponse;
