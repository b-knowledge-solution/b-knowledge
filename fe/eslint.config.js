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
    // Phase 4 (TS11/R-4): ban hardcoded role-string comparisons and isAdmin prop drilling.
    // Use useHasPermission(PERMISSION_KEYS.X) or <Can I="..." a="..."> instead.
    // See fe/CLAUDE.md "Permission Gating" section for the decision tree.
    {
        files: ["src/**/*.{ts,tsx}"],
        ignores: [
            "src/features/auth/**",
            "src/constants/roles.ts",
            "src/features/guideline/**",
            "src/features/users/types/**",
            "src/features/users/api/userQueries.ts",
            "src/features/teams/api/teamQueries.ts",
            "src/generated/**",
            "src/constants/permission-keys.ts",
        ],
        rules: {
            "no-restricted-syntax": ["error",
                {
                    // Match user.role === 'literal' (bare member access on identifier `user`).
                    // Narrowed from property-only match to avoid false positives on msg.role / chat-message role fields.
                    selector: "BinaryExpression[operator='==='][left.type='MemberExpression'][left.object.name='user'][left.property.name='role'][right.type='Literal']",
                    message: "Do not compare user.role to a string literal. Use useHasPermission(PERMISSION_KEYS.<KEY>) for feature gates or <Can I=\"action\" a=\"Subject\"> for instance-level checks. See fe/CLAUDE.md.",
                },
                {
                    selector: "BinaryExpression[operator='!=='][left.type='MemberExpression'][left.object.name='user'][left.property.name='role'][right.type='Literal']",
                    message: "Do not compare user.role to a string literal. Use useHasPermission or <Can>.",
                },
                {
                    selector: "JSXAttribute[name.name='isAdmin']",
                    message: "isAdmin prop drilling is banned. Replace with useHasPermission(PERMISSION_KEYS.<KEY>) inside the child component.",
                },
            ],
        },
    },
];
