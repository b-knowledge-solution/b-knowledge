
/**
 * Lazy-loaded singletons for all data models to keep connection sharing consistent.
 */
import { UserModel } from '@/modules/users/models/user.model.js';
import { TeamModel } from '@/modules/teams/models/team.model.js';
import { UserTeamModel } from '@/modules/teams/models/user-team.model.js';
import { ChatSessionModel } from '@/modules/chat/models/chat-session.model.js';
import { ChatMessageModel } from '@/modules/chat/models/chat-message.model.js';
import { SystemConfigModel } from '@/shared/models/system-config.model.js';

import { AuditLogModel } from '@/modules/audit/models/audit-log.model.js';
import { UserIpHistoryModel } from '@/modules/users/models/user-ip-history.model.js';
import { BroadcastMessageModel } from '@/modules/broadcast/models/broadcast-message.model.js';
import { UserDismissedBroadcastModel } from '@/modules/broadcast/models/user-dismissed-broadcast.model.js';
import { HistoryChatSessionModel } from '@/shared/models/history-chat-session.model.js';
import { HistoryChatMessageModel } from '@/shared/models/history-chat-message.model.js';
import { HistorySearchSessionModel } from '@/shared/models/history-search-session.model.js';
import { HistorySearchRecordModel } from '@/shared/models/history-search-record.model.js';

import { GlossaryTaskModel } from '@/modules/glossary/models/glossary-task.model.js';
import { GlossaryKeywordModel } from '@/modules/glossary/models/glossary-keyword.model.js';

import { DatasetModel } from '@/modules/rag/models/dataset.model.js';
import { DocumentModel } from '@/modules/rag/models/document.model.js';
import { ModelProviderModel } from '@/modules/rag/models/model-provider.model.js';
import { KnowledgebaseModel } from '@/modules/rag/models/knowledgebase.model.js';
import { RagDocumentModel } from '@/modules/rag/models/rag-document.model.js';
import { RagFileModel } from '@/modules/rag/models/rag-file.model.js';
import { RagTaskModel } from '@/modules/rag/models/rag-task.model.js';
import { ConnectorModel } from '@/modules/sync/models/connector.model.js';
import { SyncLogModel } from '@/modules/sync/models/sync-log.model.js';
import { ChatAssistantModel } from '@/modules/chat/models/chat-assistant.model.js';
import { ChatAssistantAccessModel } from '@/modules/chat/models/chat-assistant-access.model.js';
import { ChatFileModel } from '@/modules/chat/models/chat-file.model.js';
import { ChatEmbedTokenModel } from '@/modules/chat/models/chat-embed-token.model.js';
import { SearchAppModel } from '@/modules/search/models/search-app.model.js'
import { SearchAppAccessModel } from '@/modules/search/models/search-app-access.model.js';
import { DocumentVersionModel } from '@/modules/rag/models/document-version.model.js';
import { DocumentVersionFileModel } from '@/modules/rag/models/document-version-file.model.js';
import { ConverterJobModel } from '@/modules/rag/models/converter-job.model.js';
import { AnswerFeedbackModel } from '@/modules/feedback/models/answer-feedback.model.js';
import { QueryLogModel } from '@/modules/rag/models/query-log.model.js';

// Project Models
import { ProjectModel } from '@/modules/projects/models/project.model.js';
import { ProjectPermissionModel } from '@/modules/projects/models/project-permission.model.js';
import { ProjectDatasetModel } from '@/modules/projects/models/project-dataset.model.js';
import { ProjectSyncConfigModel } from '@/modules/projects/models/project-sync-config.model.js';
import { DocumentCategoryModel } from '@/modules/projects/models/document-category.model.js';
import { DocumentCategoryVersionModel } from '@/modules/projects/models/document-category-version.model.js';
import { DocumentCategoryVersionFileModel } from '@/modules/projects/models/document-category-version-file.model.js';
import { ProjectChatModel } from '@/modules/projects/models/project-chat.model.js';
import { ProjectSearchModel } from '@/modules/projects/models/project-search.model.js';
import { ProjectEntityPermissionModel } from '@/modules/projects/models/project-entity-permission.model.js';
import { ApiKeyModel } from '@/modules/external/models/api-key.model.js';

// Agent Models
import { AgentModel } from '@/modules/agents/models/agent.model.js';
import { AgentRunModel } from '@/modules/agents/models/agent-run.model.js';
import { AgentRunStepModel } from '@/modules/agents/models/agent-run-step.model.js';
import { AgentTemplateModel } from '@/modules/agents/models/agent-template.model.js';
import { AgentToolCredentialModel } from '@/modules/agents/models/agent-tool-credential.model.js';

/**
 * @description ModelFactory class implementing the Factory Pattern.
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

  /** Audit log model singleton instance */
  private static auditLogModel: AuditLogModel;
  /** User IP history model singleton instance */
  private static userIpHistoryModel: UserIpHistoryModel;
  /** Broadcast message model singleton instance */
  private static broadcastMessageModel: BroadcastMessageModel;
  /** User dismissed broadcast model singleton instance */
  private static userDismissedBroadcastModel: UserDismissedBroadcastModel;

  // History Models
  /** History chat session model singleton instance */
  private static historyChatSessionModel: HistoryChatSessionModel;
  /** History chat message model singleton instance */
  private static historyChatMessageModel: HistoryChatMessageModel;
  /** History search session model singleton instance */
  private static historySearchSessionModel: HistorySearchSessionModel;
  /** History search record model singleton instance */
  private static historySearchRecordModel: HistorySearchRecordModel;




  // Glossary Models
  /** Glossary task model singleton instance */
  private static glossaryTaskModel: GlossaryTaskModel;
  /** Glossary keyword model singleton instance */
  private static glossaryKeywordModel: GlossaryKeywordModel;

  // RAG Models
  /** Dataset model singleton instance */
  private static datasetModel: DatasetModel;
  /** Document model singleton instance */
  private static documentModel: DocumentModel;
  /** Model provider model singleton instance */
  private static modelProviderModel: ModelProviderModel;
  /** Knowledgebase (Peewee) model singleton instance */
  private static knowledgebaseModel: KnowledgebaseModel;
  /** RagDocument (Peewee) model singleton instance */
  private static ragDocumentModel: RagDocumentModel;
  /** RagFile (Peewee) model singleton instance */
  private static ragFileModel: RagFileModel;
  /** RagTask (Peewee) model singleton instance */
  private static ragTaskModel: RagTaskModel;
  /** Connector model singleton instance */
  private static connectorModel: ConnectorModel;
  /** SyncLog model singleton instance */
  private static syncLogModel: SyncLogModel;
  /** ChatAssistant model singleton instance */
  private static chatAssistantModel: ChatAssistantModel;
  /** ChatAssistantAccess model singleton instance */
  private static chatAssistantAccessModel: ChatAssistantAccessModel;
  /** ChatFile model singleton instance */
  private static chatFileModel: ChatFileModel;
  /** ChatEmbedToken model singleton instance */
  private static chatEmbedTokenModel: ChatEmbedTokenModel;
  /** SearchApp model singleton instance */
  private static searchAppModel: SearchAppModel;
  /** SearchAppAccess model singleton instance */
  private static searchAppAccessModel: SearchAppAccessModel;
  /** DocumentVersion model singleton instance */
  private static documentVersionModel: DocumentVersionModel;
  /** DocumentVersionFile model singleton instance */
  private static documentVersionFileModel: DocumentVersionFileModel;
  /** ConverterJob model singleton instance */
  private static converterJobModel: ConverterJobModel;
  /** AnswerFeedback model singleton instance */
  private static answerFeedbackModel: AnswerFeedbackModel;
  /** QueryLog model singleton instance */
  private static queryLogModel: QueryLogModel;

  // Project Models
  /** Project model singleton instance */
  private static projectModel: ProjectModel;
  /** ProjectPermission model singleton instance */
  private static projectPermissionModel: ProjectPermissionModel;
  /** ProjectDataset model singleton instance */
  private static projectDatasetModel: ProjectDatasetModel;
  /** ProjectSyncConfig model singleton instance */
  private static projectSyncConfigModel: ProjectSyncConfigModel;
  /** DocumentCategory model singleton instance */
  private static documentCategoryModel: DocumentCategoryModel;
  /** DocumentCategoryVersion model singleton instance */
  private static documentCategoryVersionModel: DocumentCategoryVersionModel;
  /** DocumentCategoryVersionFile model singleton instance */
  private static documentCategoryVersionFileModel: DocumentCategoryVersionFileModel;
  /** ProjectChat model singleton instance */
  private static projectChatModel: ProjectChatModel;
  /** ProjectSearch model singleton instance */
  private static projectSearchModel: ProjectSearchModel;
  /** ProjectEntityPermission model singleton instance */
  private static projectEntityPermissionModel: ProjectEntityPermissionModel;
  /** ApiKey model singleton instance */
  private static apiKeyModel: ApiKeyModel;

  // Agent Models
  /** Agent model singleton instance */
  private static agentModel: AgentModel;
  /** AgentRun model singleton instance */
  private static agentRunModel: AgentRunModel;
  /** AgentRunStep model singleton instance */
  private static agentRunStepModel: AgentRunStepModel;
  /** AgentTemplate model singleton instance */
  private static agentTemplateModel: AgentTemplateModel;
  /** AgentToolCredential model singleton instance */
  private static agentToolCredentialModel: AgentToolCredentialModel;

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
   * @description Get the HistoryChatSession model singleton
   * @returns {HistoryChatSessionModel} Instance for chat session history operations
   */
  static get historyChatSession() {
    // Create instance on first access (lazy initialization)
    if (!this.historyChatSessionModel) this.historyChatSessionModel = new HistoryChatSessionModel();
    return this.historyChatSessionModel;
  }

  /**
   * @description Get the HistoryChatMessage model singleton
   * @returns {HistoryChatMessageModel} Instance for chat message history operations
   */
  static get historyChatMessage() {
    // Create instance on first access (lazy initialization)
    if (!this.historyChatMessageModel) this.historyChatMessageModel = new HistoryChatMessageModel();
    return this.historyChatMessageModel;
  }

  /**
   * @description Get the HistorySearchSession model singleton
   * @returns {HistorySearchSessionModel} Instance for search session history operations
   */
  static get historySearchSession() {
    // Create instance on first access (lazy initialization)
    if (!this.historySearchSessionModel) this.historySearchSessionModel = new HistorySearchSessionModel();
    return this.historySearchSessionModel;
  }

  /**
   * @description Get the HistorySearchRecord model singleton
   * @returns {HistorySearchRecordModel} Instance for search record history operations
   */
  static get historySearchRecord() {
    // Create instance on first access (lazy initialization)
    if (!this.historySearchRecordModel) this.historySearchRecordModel = new HistorySearchRecordModel();
    return this.historySearchRecordModel;
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

  /**
   * @description Get the Dataset model singleton
   * @returns {DatasetModel} Instance for dataset CRUD operations
   */
  static get dataset() {
    // Create instance on first access (lazy initialization)
    if (!this.datasetModel) this.datasetModel = new DatasetModel();
    return this.datasetModel;
  }

  /**
   * @description Get the Document model singleton
   * @returns {DocumentModel} Instance for document CRUD operations
   */
  static get document() {
    // Create instance on first access (lazy initialization)
    if (!this.documentModel) this.documentModel = new DocumentModel();
    return this.documentModel;
  }

  /**
   * @description Get the ModelProvider model singleton
   * @returns {ModelProviderModel} Instance for model provider CRUD operations
   */
  static get modelProvider() {
    // Create instance on first access (lazy initialization)
    if (!this.modelProviderModel) this.modelProviderModel = new ModelProviderModel();
    return this.modelProviderModel;
  }

  /**
   * @description Get the Knowledgebase model singleton for Peewee-schema knowledgebase table
   * @returns {KnowledgebaseModel} Instance for knowledgebase CRUD operations
   */
  static get knowledgebase() {
    // Create instance on first access (lazy initialization)
    if (!this.knowledgebaseModel) this.knowledgebaseModel = new KnowledgebaseModel();
    return this.knowledgebaseModel;
  }

  /**
   * @description Get the RagDocument model singleton for Peewee-schema document table
   * @returns {RagDocumentModel} Instance for RAG document CRUD operations
   */
  static get ragDocument() {
    // Create instance on first access (lazy initialization)
    if (!this.ragDocumentModel) this.ragDocumentModel = new RagDocumentModel();
    return this.ragDocumentModel;
  }

  /**
   * @description Get the RagFile model singleton for Peewee-schema file table
   * @returns {RagFileModel} Instance for RAG file CRUD operations
   */
  static get ragFile() {
    // Create instance on first access (lazy initialization)
    if (!this.ragFileModel) this.ragFileModel = new RagFileModel();
    return this.ragFileModel;
  }

  /**
   * @description Get the RagTask model singleton for Peewee-schema task table
   * @returns {RagTaskModel} Instance for RAG task CRUD operations
   */
  static get ragTask() {
    // Create instance on first access (lazy initialization)
    if (!this.ragTaskModel) this.ragTaskModel = new RagTaskModel();
    return this.ragTaskModel;
  }

  /**
   * Get the Connector model singleton.
   * @returns ConnectorModel instance for connector CRUD operations
   */
  static get connector() {
    if (!this.connectorModel) this.connectorModel = new ConnectorModel();
    return this.connectorModel;
  }

  /**
   * Get the SyncLog model singleton.
   * @returns SyncLogModel instance for sync log operations
   */
  static get syncLog() {
    if (!this.syncLogModel) this.syncLogModel = new SyncLogModel();
    return this.syncLogModel;
  }

  /**
   * Get the ChatAssistant model singleton.
   * @returns ChatAssistantModel instance for assistant configuration operations
   */
  static get chatAssistant() {
    if (!this.chatAssistantModel) this.chatAssistantModel = new ChatAssistantModel();
    return this.chatAssistantModel;
  }

  /**
   * Get the ChatAssistantAccess model singleton.
   * Manages RBAC access entries for chat assistants.
   * @returns ChatAssistantAccessModel instance for access control operations
   */
  static get chatAssistantAccess() {
    // Create instance on first access (lazy initialization)
    if (!this.chatAssistantAccessModel) this.chatAssistantAccessModel = new ChatAssistantAccessModel();
    return this.chatAssistantAccessModel;
  }

  /**
   * Get the ChatFile model singleton.
   * Manages file attachments for chat conversations.
   * @returns ChatFileModel instance for chat file operations
   */
  static get chatFile() {
    if (!this.chatFileModel) this.chatFileModel = new ChatFileModel();
    return this.chatFileModel;
  }

  /**
   * Get the ChatEmbedToken model singleton.
   * Manages embed tokens for external chat widget access.
   * @returns ChatEmbedTokenModel instance for embed token operations
   */
  static get chatEmbedToken() {
    if (!this.chatEmbedTokenModel) this.chatEmbedTokenModel = new ChatEmbedTokenModel();
    return this.chatEmbedTokenModel;
  }

  /**
   * Get the SearchApp model singleton.
   * @returns SearchAppModel instance for search app operations
   */
  static get searchApp() {
    if (!this.searchAppModel) this.searchAppModel = new SearchAppModel();
    return this.searchAppModel;
  }

  /**
   * Get the SearchAppAccess model singleton.
   * Manages RBAC access entries for search apps.
   * @returns SearchAppAccessModel instance for access control operations
   */
  static get searchAppAccess() {
    // Create instance on first access (lazy initialization)
    if (!this.searchAppAccessModel) this.searchAppAccessModel = new SearchAppAccessModel();
    return this.searchAppAccessModel;
  }

  /**
   * Get the DocumentVersion model singleton.
   * Manages document version records for datasets.
   * @returns DocumentVersionModel instance for version CRUD operations
   */
  static get documentVersion() {
    if (!this.documentVersionModel) this.documentVersionModel = new DocumentVersionModel();
    return this.documentVersionModel;
  }

  /**
   * Get the DocumentVersionFile model singleton.
   * Manages files within document versions.
   * @returns DocumentVersionFileModel instance for version file operations
   */
  static get documentVersionFile() {
    if (!this.documentVersionFileModel) this.documentVersionFileModel = new DocumentVersionFileModel();
    return this.documentVersionFileModel;
  }

  /**
   * Get the ConverterJob model singleton.
   * Manages converter job tracking records.
   * @returns ConverterJobModel instance for converter job operations
   */
  static get converterJob() {
    if (!this.converterJobModel) this.converterJobModel = new ConverterJobModel();
    return this.converterJobModel;
  }

  /**
   * Get the AnswerFeedback model singleton.
   * Manages user feedback on chat and search answers.
   * @returns AnswerFeedbackModel instance for feedback CRUD and queries
   */
  static get answerFeedback() {
    if (!this.answerFeedbackModel) this.answerFeedbackModel = new AnswerFeedbackModel();
    return this.answerFeedbackModel;
  }

  /**
   * Get the QueryLog model singleton.
   * Manages query event records for analytics and observability.
   * @returns QueryLogModel instance for query log CRUD operations
   */
  static get queryLog() {
    if (!this.queryLogModel) this.queryLogModel = new QueryLogModel();
    return this.queryLogModel;
  }

  // -------------------------------------------------------------------------
  // Project Models
  // -------------------------------------------------------------------------

  /**
   * Get the Project model singleton.
   * @returns ProjectModel instance for project CRUD operations
   */
  static get project() {
    if (!this.projectModel) this.projectModel = new ProjectModel();
    return this.projectModel;
  }

  /**
   * Get the ProjectPermission model singleton.
   * @returns ProjectPermissionModel instance for permission operations
   */
  static get projectPermission() {
    if (!this.projectPermissionModel) this.projectPermissionModel = new ProjectPermissionModel();
    return this.projectPermissionModel;
  }

  /**
   * Get the ProjectDataset model singleton.
   * @returns ProjectDatasetModel instance for project-dataset junction operations
   */
  static get projectDataset() {
    if (!this.projectDatasetModel) this.projectDatasetModel = new ProjectDatasetModel();
    return this.projectDatasetModel;
  }

  /**
   * Get the ProjectSyncConfig model singleton.
   * @returns ProjectSyncConfigModel instance for sync config operations
   */
  static get projectSyncConfig() {
    if (!this.projectSyncConfigModel) this.projectSyncConfigModel = new ProjectSyncConfigModel();
    return this.projectSyncConfigModel;
  }

  /**
   * Get the DocumentCategory model singleton.
   * @returns DocumentCategoryModel instance for category CRUD operations
   */
  static get documentCategory() {
    if (!this.documentCategoryModel) this.documentCategoryModel = new DocumentCategoryModel();
    return this.documentCategoryModel;
  }

  /**
   * Get the DocumentCategoryVersion model singleton.
   * @returns DocumentCategoryVersionModel instance for version CRUD operations
   */
  static get documentCategoryVersion() {
    if (!this.documentCategoryVersionModel) this.documentCategoryVersionModel = new DocumentCategoryVersionModel();
    return this.documentCategoryVersionModel;
  }

  /**
   * Get the DocumentCategoryVersionFile model singleton.
   * @returns DocumentCategoryVersionFileModel instance for version file operations
   */
  static get documentCategoryVersionFile() {
    if (!this.documentCategoryVersionFileModel) this.documentCategoryVersionFileModel = new DocumentCategoryVersionFileModel();
    return this.documentCategoryVersionFileModel;
  }

  /**
   * Get the ProjectChat model singleton.
   * @returns ProjectChatModel instance for project chat CRUD operations
   */
  static get projectChat() {
    if (!this.projectChatModel) this.projectChatModel = new ProjectChatModel();
    return this.projectChatModel;
  }

  /**
   * Get the ProjectSearch model singleton.
   * @returns ProjectSearchModel instance for project search CRUD operations
   */
  static get projectSearch() {
    if (!this.projectSearchModel) this.projectSearchModel = new ProjectSearchModel();
    return this.projectSearchModel;
  }

  /**
   * Get the ProjectEntityPermission model singleton.
   * @returns ProjectEntityPermissionModel instance for entity permission operations
   */
  static get projectEntityPermission() {
    if (!this.projectEntityPermissionModel) this.projectEntityPermissionModel = new ProjectEntityPermissionModel();
    return this.projectEntityPermissionModel;
  }

  /**
   * Get the ApiKey model singleton.
   * @returns ApiKeyModel instance for API key CRUD operations
   */
  static get apiKey() {
    if (!this.apiKeyModel) this.apiKeyModel = new ApiKeyModel();
    return this.apiKeyModel;
  }

  // -------------------------------------------------------------------------
  // Agent Models
  // -------------------------------------------------------------------------

  /**
   * Get the Agent model singleton.
   * @returns AgentModel instance for agent CRUD operations
   */
  static get agent() {
    if (!this.agentModel) this.agentModel = new AgentModel();
    return this.agentModel;
  }

  /**
   * Get the AgentRun model singleton.
   * @returns AgentRunModel instance for agent run CRUD operations
   */
  static get agentRun() {
    if (!this.agentRunModel) this.agentRunModel = new AgentRunModel();
    return this.agentRunModel;
  }

  /**
   * Get the AgentRunStep model singleton.
   * @returns AgentRunStepModel instance for agent run step operations
   */
  static get agentRunStep() {
    if (!this.agentRunStepModel) this.agentRunStepModel = new AgentRunStepModel();
    return this.agentRunStepModel;
  }

  /**
   * Get the AgentTemplate model singleton.
   * @returns AgentTemplateModel instance for agent template CRUD operations
   */
  static get agentTemplate() {
    if (!this.agentTemplateModel) this.agentTemplateModel = new AgentTemplateModel();
    return this.agentTemplateModel;
  }

  /**
   * Get the AgentToolCredential model singleton.
   * @returns AgentToolCredentialModel instance for tool credential operations
   */
  static get agentToolCredential() {
    if (!this.agentToolCredentialModel) this.agentToolCredentialModel = new AgentToolCredentialModel();
    return this.agentToolCredentialModel;
  }
}
