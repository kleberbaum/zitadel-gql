// src/relay/PageInfo.ts
/**
 * Carries pagination state for a sliced collection.
 * This follows the Relay PageInfo shape so tooling can detect connections.
 */
export class PageInfo {
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string
  endCursor?: string

  constructor(args: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor?: string
    endCursor?: string
  }) {
    this.hasNextPage = args.hasNextPage
    this.hasPreviousPage = args.hasPreviousPage
    this.startCursor = args.startCursor
    this.endCursor = args.endCursor
  }
}
