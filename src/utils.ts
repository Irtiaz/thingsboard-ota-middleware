// Test if a topic matches an MQTT pattern (+ wildcard matches single level)
export function matchesMqttTopic(topic: string, pattern: string): boolean {
	const escaped = pattern
		.replace(/\//g, '\\/') // Escape forward slashes
		.replace(/\+/g, '[^\\/]+'); // + matches one or more non-slash characters
	const regex = new RegExp(`^${escaped}$`);
	return regex.test(topic);
}