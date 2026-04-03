import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactCompiler from "eslint-plugin-react-compiler";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
    { ignores: ["dist"] },
    js.configs.recommended,
    {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            react,
            "react-hooks": reactHooks,
            "react-compiler": reactCompiler,
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            "react-compiler/react-compiler": "warn",
            "react/react-in-jsx-scope": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["warn", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
            "no-unused-vars": "off",
            "no-undef": "off",
        },
    },
];
