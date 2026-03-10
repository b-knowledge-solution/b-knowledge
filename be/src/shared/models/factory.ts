
/**
 * Lazy-loaded singletons for all data models to keep connection sharing consistent.
 */
import { UserModel } from '@/modules/users/user.model.js';
import { TeamModel } from '@/modules/teams/team.model.js';
import { UserTeamModel } from '@/modules/teams/user-team.model.js';
import { ChatSessionModel } from '@/modules/chat/chat-session.model.js';
import { ChatMessageModel } from '@/modules/chat/chat-message.model.js';
import { SystemConfigModel } from '@/shared/models/system-config.model.js';
import { KnowledgeBaseSourceModel } from '@/modules/knowledge-base/knowledge-base-source.model.js';
import { AuditLogModel } from '@/modules/audit/audit-log.model.js';
import { UserIpHistoryModel } from '@/modules/users/user-ip-history.model.js';
import { BroadcastMessageModel } from '@/modules/broadcast/broadcast-message.model.js';
import { UserDismissedBroadcastModel } from '@/modules/broadcast/user-dismissed-broadcast.model.js';
import { ExternalChatSessionModel } from '@/modules/external/models/chat-session.model.js';
import { ExternalChatMessageModel } from '@/modules/external/models/chat-message.model.js';
import { ExternalSearchSessionModel } from '@/modules/external/models/search-session.model.js';
import { ExternalSearchRecordModel } from '@/modules/external/models/search-record.model.js';

import { GlossaryTaskModel } from '@/modules/glossary/glossary-task.model.js';
import { GlossaryKeywordModel } from '@/modules/glossary/glossary-keyword.model.js';

import { DatasetModel } from '@/modules/rag/dataset.model.js';
import { DocumentModel } from '@/modules/rag/document.model.js';
import { ModelProviderModel } from '@/modules/rag/model-provider.model.js';
import { TenantLlmModel } from '@/modules/llm-provider/tenant-llm.model.js';
import { KnowledgebaseModel } from '@/modules/rag/knowledgebase.model.js';
import { RagDocumentModel } from '@/modules/rag/rag-document.model.js';
import { RagFileModel } from '@/modules/rag/rag-file.model.js';
import { RagTaskModel } from '@/modules/rag/rag-task.model.js';

/**
 * ModelFactory class implementing the Factory Pattern.
 * Provides lazy-loaded singletons for all data models.
 * Ensures connection sharing is consistent across the application.
 * Each model is instantiated only once on first access.
 */
export class ModelFactory {
  // Private static fields to hold singleton instances
  /** User model singleton instance */
  private static userModel: UserModel;
  /** Team model singleton instance */
  private static teamModel: TeamModel;
  /** User-Team relationship model singleton instance */
  private static userTeamModel: UserTeamModel;
  /** Chat session model singleton instance */
  private static chatSessionModel: ChatSessionModel;
  /** Chat message model singleton instance */
  private static chatMessageModel: ChatMessageModel;
  /** System config model singleton instance */
  private static systemConfigModel: SystemConfigModel;
  /** Knowledge base source model singleton instance */
  private static knowledgeBaseSourceModel: KnowledgeBaseSourceModel;
  /** Audit log model singleton instance */
  private static auditLogModel: AuditLogModel;
  /** User IP history model singleton instance */
  private static userIpHistoryModel: UserIpHistoryModel;
  /** Broadcast message model singleton instance */
  private static broadcastMessageModel: BroadcastMessageModel;
  /** User dismissed broadcast model singleton instance */
  private static userDismissedBroadcastModel: UserDismissedBroadcastModel;

  // External History Models
  private static externalChatSessionModel: ExternalChatSessionModel;
  private static externalChatMessageModel: ExternalChatMessageModel;
  private static externalSearchSessionModel: ExternalSearchSessionModel;
  private static externalSearchRecordModel: ExternalSearchRecordModel;




  // Glossary Models
  private static glossaryTaskModel: GlossaryTaskModel;
  private static glossaryKeywordModel: GlossaryKeywordModel;

  // RAG Models
  private static datasetModel: DatasetModel;
  private static documentModel: DocumentModel;
  private static modelProviderModel: ModelProviderModel;
  /** TenantLlm model singleton instance */
  private static tenantLlmModel: TenantLlmModel;
  /** Knowledgebase (Peewee) model singleton instance */
  private static knowledgebaseModel: KnowledgebaseModel;
  /** RagDocument (Peewee) model singleton instance */
  private static ragDocumentModel: RagDocumentModel;
  /** RagFile (Peewee) model singleton instance */
  private static ragFileModel: RagFileModel;
  /** RagTask (Peewee) model singleton instance */
  private static ragTaskModel: RagTaskModel;

  /**
   * Get the User model singleton.
   * Lazily instantiates the model on first access.
   * @returns UserModel instance for user CRUD operations
   */
  static get user() {
    // Create instance on first access (lazy initialization)
    if (!this.userModel) this.userModel = new UserModel();
    return this.userModel;
  }

  /**
   * Get the Team model singleton.
   * Lazily instantiates the model on first access.
   * @returns TeamModel instance for team CRUD operations
   */
  static get team() {
    // Create instance on first access (lazy initialization)
    if (!this.teamModel) this.teamModel = new TeamModel();
    return this.teamModel;
  }

  /**
   * Get the UserTeam model singleton.
   * Manages user-to-team membership relationships.
   * @returns UserTeamModel instance for user-team relationship operations
   */
  static get userTeam() {
    // Create instance on first access (lazy initialization)
    if (!this.userTeamModel) this.userTeamModel = new UserTeamModel();
    return this.userTeamModel;
  }

  /**
   * Get the ChatSession model singleton.
   * Manages chat conversation sessions.
   * @returns ChatSessionModel instance for session CRUD operations
   */
  static get chatSession() {
    // Create instance on first access (lazy initialization)
    if (!this.chatSessionModel) this.chatSessionModel = new ChatSessionModel();
    return this.chatSessionModel;
  }

  /**
   * Get the ChatMessage model singleton.
   * Manages individual chat messages within sessions.
   * @returns ChatMessageModel instance for message CRUD operations
   */
  static get chatMessage() {
    // Create instance on first access (lazy initialization)
    if (!this.chatMessageModel) this.chatMessageModel = new ChatMessageModel();
    return this.chatMessageModel;
  }

  /**
   * Get the SystemConfig model singleton.
   * Manages key-value system configuration storage.
   * @returns SystemConfigModel instance for config CRUD operations
   */
  static get systemConfig() {
    // Create instance on first access (lazy initialization)
    if (!this.systemConfigModel) this.systemConfigModel = new SystemConfigModel();
    return this.systemConfigModel;
  }

  /**
   * Get the KnowledgeBaseSource model singleton.
   * Manages knowledge base source metadata and ACLs.
   * @returns KnowledgeBaseSourceModel instance for source CRUD operations
   */
  static get knowledgeBaseSource() {
    // Create instance on first access (lazy initialization)
    if (!this.knowledgeBaseSourceModel) this.knowledgeBaseSourceModel = new KnowledgeBaseSourceModel();
    return this.knowledgeBaseSourceModel;
  }

  /**
   * Get the AuditLog model singleton.
   * Manages audit trail entries for security and compliance.
   * @returns AuditLogModel instance for audit log operations
   */
  static get auditLog() {
    // Create instance on first access (lazy initialization)
    if (!this.auditLogModel) this.auditLogModel = new AuditLogModel();
    return this.auditLogModel;
  }

  /**
   * Get the UserIpHistory model singleton.
   * Manages user IP address history for tracking.
   * @returns UserIpHistoryModel instance for IP history operations
   */
  static get userIpHistory() {
    // Create instance on first access (lazy initialization)
    if (!this.userIpHistoryModel) this.userIpHistoryModel = new UserIpHistoryModel();
    return this.userIpHistoryModel;
  }

  /**
   * Get the BroadcastMessage model singleton.
   * Manages system-wide broadcast messages.
   * @returns BroadcastMessageModel instance for broadcast operations
   */
  static get broadcastMessage() {
    // Create instance on first access (lazy initialization)
    if (!this.broadcastMessageModel) this.broadcastMessageModel = new BroadcastMessageModel();
    return this.broadcastMessageModel;
  }

  /**
   * Get the UserDismissedBroadcast model singleton.
   * Tracks which broadcasts users have dismissed.
   * @returns UserDismissedBroadcastModel instance for dismissed broadcast operations
   */
  static get userDismissedBroadcast() {
    // Create instance on first access (lazy initialization)
    if (!this.userDismissedBroadcastModel) this.userDismissedBroadcastModel = new UserDismissedBroadcastModel();
    return this.userDismissedBroadcastModel;
  }

  /**
   * Get the ExternalChatSession model singleton.
   */
  static get externalChatSession() {
    if (!this.externalChatSessionModel) this.externalChatSessionModel = new ExternalChatSessionModel();
    return this.externalChatSessionModel;
  }

  /**
   * Get the ExternalChatMessage model singleton.
   */
  static get externalChatMessage() {
    if (!this.externalChatMessageModel) this.externalChatMessageModel = new ExternalChatMessageModel();
    return this.externalChatMessageModel;
  }

  /**
   * Get the ExternalSearchSession model singleton.
   */
  static get externalSearchSession() {
    if (!this.externalSearchSessionModel) this.externalSearchSessionModel = new ExternalSearchSessionModel();
    return this.externalSearchSessionModel;
  }

  /**
   * Get the ExternalSearchRecord model singleton.
   */
  static get externalSearchRecord() {
    if (!this.externalSearchRecordModel) this.externalSearchRecordModel = new ExternalSearchRecordModel();
    return this.externalSearchRecordModel;
  }




  /**
   * Get the GlossaryTask model singleton.
   * Manages glossary tasks for prompt builder.
   * @returns GlossaryTaskModel instance for task operations
   */
  static get glossaryTask() {
    if (!this.glossaryTaskModel) this.glossaryTaskModel = new GlossaryTaskModel();
    return this.glossaryTaskModel;
  }

  /**
   * Get the GlossaryKeyword model singleton.
   * Manages glossary keywords belonging to tasks.
   * @returns GlossaryKeywordModel instance for keyword operations
   */
  static get glossaryKeyword() {
    if (!this.glossaryKeywordModel) this.glossaryKeywordModel = new GlossaryKeywordModel();
    return this.glossaryKeywordModel;
  }

  static get dataset() {
    if (!this.datasetModel) this.datasetModel = new DatasetModel();
    return this.datasetModel;
  }

  static get document() {
    if (!this.documentModel) this.documentModel = new DocumentModel();
    return this.documentModel;
  }

  static get modelProvider() {
    if (!this.modelProviderModel) this.modelProviderModel = new ModelProviderModel();
    return this.modelProviderModel;
  }

  /**
   * Get the TenantLlm model singleton.
   * Manages the shared tenant_llm table read by Python task executors.
   * @returns TenantLlmModel instance for tenant LLM config operations
   */
  static get tenantLlm() {
    // Create instance on first access (lazy initialization)
    if (!this.tenantLlmModel) this.tenantLlmModel = new TenantLlmModel();
    return this.tenantLlmModel;
  }

  static get knowledgebase() {
    if (!this.knowledgebaseModel) this.knowledgebaseModel = new KnowledgebaseModel();
    return this.knowledgebaseModel;
  }

  static get ragDocument() {
    if (!this.ragDocumentModel) this.ragDocumentModel = new RagDocumentModel();
    return this.ragDocumentModel;
  }

  static get ragFile() {
    if (!this.ragFileModel) this.ragFileModel = new RagFileModel();
    return this.ragFileModel;
  }

  static get ragTask() {
    if (!this.ragTaskModel) this.ragTaskModel = new RagTaskModel();
    return this.ragTaskModel;
  }
}
