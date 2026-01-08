import { z } from "zod";

// Device identifier schema
export const deviceIdentifierSchema = z.object({
	accessToken: z.string().min(1, "accessToken is required"),
	devEUI: z.string().min(1, "devEUI is required"),
});

// Add device request schema
export const addDeviceSchema = z.object({
	deviceIdentifier: deviceIdentifierSchema,
});

// Delete device request schema
export const deleteDeviceSchema = z.object({
	accessToken: z.string().min(1, "accessToken is required"),
});

// Infer TypeScript types from schemas
export type AddDeviceRequest = z.infer<typeof addDeviceSchema>;
export type DeleteDeviceRequest = z.infer<typeof deleteDeviceSchema>;