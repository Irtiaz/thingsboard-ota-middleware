// ANSI color codes
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

export enum LogLevel {
	INFO = "INFO",
	WARN = "WARN",
	ERROR = "ERROR",
	DEBUG = "DEBUG",
}

export function log(level: LogLevel, tag: string, message: string) {
	const timestamp = new Date().toISOString();
	let colorCode = colors.reset;

	switch (level) {
		case LogLevel.INFO:
			colorCode = colors.green;
			break;
		case LogLevel.WARN:
			colorCode = colors.yellow;
			break;
		case LogLevel.ERROR:
			colorCode = colors.red;
			break;
		case LogLevel.DEBUG:
			colorCode = colors.cyan;
			break;
	}

	const formattedMessage = `${colors.gray}[${timestamp}]${colors.reset} ${colorCode}[${level}]${colors.reset} ${colors.magenta}[${tag}]${colors.reset} ${message}`;
	console.log(formattedMessage);
}