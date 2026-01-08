import type { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

// Middleware to validate request body against a Zod schema
export function validateRequest<T extends z.ZodTypeAny>(schema: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		try {
			// Validate and parse the request body
			req.body = schema.parse(req.body);
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				// Format validation errors
				const errors = error.issues.map((issue) => ({
					path: issue.path.join('.'),
					message: issue.message,
				}));

				res.status(400).json({
					error: "Validation failed",
					details: errors,
				});
			} else {
				res.status(500).json({
					error: "Internal server error",
				});
			}
		}
	};
}