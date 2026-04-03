/**
 * @fileoverview Type declarations for the mime-types library.
 *
 * Provides ambient type definitions for MIME type lookup, content-type
 * generation, and extension resolution used by file upload validation
 * and download response headers.
 *
 * @module types/mime-types
 */
declare module 'mime-types' {
    /**
     * @description Look up the MIME type for a filename or extension.
     * @param {string} filenameOrExt - Filename (e.g. 'file.pdf') or extension (e.g. '.pdf')
     * @returns {string | false} MIME type string or false if not found
     */
    export function lookup(filenameOrExt: string): string | false;

    /**
     * @description Generate a full Content-Type header value with charset for a filename or extension.
     * @param {string} filenameOrExt - Filename or extension
     * @returns {string | false} Content-Type header value or false if unknown
     */
    export function contentType(filenameOrExt: string): string | false;

    /**
     * @description Look up the default file extension for a MIME type.
     * @param {string} typeString - MIME type (e.g. 'application/pdf')
     * @returns {string | false} Extension without dot or false if unknown
     */
    export function extension(typeString: string): string | false;

    /**
     * @description Look up the default charset for a MIME type.
     * @param {string} typeString - MIME type
     * @returns {string | false} Charset string or false if unknown
     */
    export function charset(typeString: string): string | false;

    /** Map of extension to MIME type */
    export const types: { [key: string]: string };

    /** Map of MIME type to array of extensions */
    export const extensions: { [key: string]: string[] };
}
