function validateHuntData(huntData) {
        const errors = [];
        if (!huntData || typeof huntData !== "object") {
                errors.push("Hunt data must be a valid JSON object");
                return errors;
        }

        if (!huntData.name || typeof huntData.name !== "string") {
                errors.push("Hunt must have a valid 'name' field");
        }

        if (!huntData.levels || !Array.isArray(huntData.levels)) {
                errors.push("Hunt must have a 'levels' array");
                return errors;
        }

        if (huntData.levels.length === 0) {
                errors.push("Hunt must have at least one level");
                return errors;
        }

        if (huntData.levels.length > 100) {
                errors.push("Hunt cannot have more than 100 levels");
        }

        const levelIds = new Set();
        huntData.levels.forEach((level, index) => {
                const levelPrefix = `Level ${index + 1}`;
                if (!level.id || typeof level.id !== "number") {
                        errors.push(`${levelPrefix}: Must have a valid numeric 'id' field`);
                } else {
                        if (levelIds.has(level.id)) {
                                errors.push(`${levelPrefix}: Duplicate level ID ${level.id}`);
                        }
                        levelIds.add(level.id);

                        if (level.id < 1 || level.id > 1000) {
                                errors.push(`${levelPrefix}: Level ID must be between 1 and 1000`);
                        }
                }

                if (!level.question || typeof level.question !== "string") {
                        errors.push(`${levelPrefix}: Must have a valid 'question' field`);
                } else if (level.question.length > 2000) {
                        errors.push(`${levelPrefix}: Question cannot exceed 2000 characters`);
                }

                if (!level.answer) {
                        errors.push(`${levelPrefix}: Must have an 'answer' field`);
                } else {
                        if (Array.isArray(level.answer)) {
                                if (level.answer.length === 0) {
                                        errors.push(`${levelPrefix}: Answer array cannot be empty`);
                                } else {
                                        level.answer.forEach((ans, ansIndex) => {
                                                if (typeof ans !== "string" || ans.trim() === "") {
                                                        errors.push(
                                                                `${levelPrefix}: Answer ${ansIndex + 1} must be a non-empty string`,
                                                        );
                                                }
                                        });
                                }
                        } else if (
                                typeof level.answer !== "string" ||
                                level.answer.trim() === ""
                        ) {
                                errors.push(
                                        `${levelPrefix}: Answer must be a non-empty string or array of strings`,
                                );
                        }
                }

                if (level.hint && typeof level.hint !== "string") {
                        errors.push(`${levelPrefix}: Hint must be a string`);
                } else if (level.hint && level.hint.length > 1000) {
                        errors.push(`${levelPrefix}: Hint cannot exceed 1000 characters`);
                }

                if (
                        level.points &&
                        (typeof level.points !== "number" ||
                                level.points < 1 ||
                                level.points > 10000)
                ) {
                        errors.push(
                                `${levelPrefix}: Points must be a number between 1 and 10000`,
                        );
                }

                if (level.image && typeof level.image !== "string") {
                        errors.push(`${levelPrefix}: Image must be a valid URL string`);
                }
        });

        return errors;
}

module.exports = { validateHuntData };
