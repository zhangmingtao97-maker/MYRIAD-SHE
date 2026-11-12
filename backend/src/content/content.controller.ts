import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Header, NotFoundException, Optional, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { PoolClient } from 'pg';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { UserAuthGuard } from '../auth/user-auth.guard';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../admin/audit.service';
import { RedisService } from '../cache/redis.service';
import { parseDatabaseCount, parsePagination } from '../pagination';
import { defaultDiscussionContent, DiscussionContent, validateDiscussionContent } from './discussion-content';
import { plainTextFromRichText, sanitizeRichText } from './rich-text';
import { DataEncryptionService } from '../security/data-encryption.service';
import { mergePublishedCommunityContent } from '../discussion/published-community';
import { findActiveDiscussionRestriction } from '../discussion/discussion-restrictions';
import { readDiscussionSupportSettings } from '../discussion/discussion-support-settings';

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const allowedAudioTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a'];
const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/webm'];
const maxIssueAudioTracks = 20;
const maxIssueAudioActions = 8;
const issueRichTextOptions = { allowEmpty: true, minFontSize: 10, maxFontSize: 72, maxHtmlCharacters: 24000 } as const;
type PracticeEntryKey = string;

interface PublicHomeResponse {
  issue: { code: string; label: string; labelRichText: string; month: string; monthRichText: string; theme: string; themeRichText: string; question: string; questionRichText: string; microVoiceTitle: string | null; microVoiceDuration: string | null; homeMetaRichText: string; homeMetaFontSize: number; homeMetaColor: string; homeCoverCaptionLeft: string; homeCoverCaptionLeftRichText: string; homeCoverCaptionRight: string; homeCoverCaptionRightRichText: string; homeBackgroundUrl: string } | null;
  question: string;
  coverUrl: string;
  microVoice: { title: string; duration: string; url: string; enabled: boolean };
  sections: string[];
  publishedVersion: number;
  modules: Array<Record<string, unknown>>;
}

interface PublicHomeCache {
  issue: {
    code: string;
    label: string;
    labelRichText: string;
    month: string;
    monthRichText: string;
    theme: string;
    themeRichText: string;
    question: string;
    questionRichText: string;
    microVoiceTitle: string | null;
    microVoiceDuration: string | null;
    homeMetaRichText: string;
    homeMetaFontSize: number;
    homeMetaColor: string;
    homeCoverCaptionLeft: string;
    homeCoverCaptionLeftRichText: string;
    homeCoverCaptionRight: string;
    homeCoverCaptionRightRichText: string;
    coverObjectKey: string | null;
    microVoiceObjectKey: string | null;
    homeBackgroundObjectKey: string | null;
  } | null;
  question: string;
  sections: string[];
  publishedVersion: number;
  modules: Array<Record<string, unknown>>;
}

const issueModuleTypes = ['issueMeta', 'coverStory', 'cover', 'opener', 'story', 'storyAction', 'image', 'quote', 'audio', 'question', 'observationAction', 'sharedPracticeAction', 'contents', 'archive', 'brandFooter'] as const;
type IssueModuleType = typeof issueModuleTypes[number];
interface IssueAudioAction {
  id: string;
  label: string;
  labelRichText?: string;
  kind: 'page' | 'web' | 'share';
  path?: string;
  url?: string;
}
interface IssueAudioTrack {
  id: string;
  title: string;
  titleRichText?: string;
  duration: string;
  mediaType: 'audio' | 'video';
  audioObjectKey: string;
  videoObjectKey: string;
  detailTitle: string;
  detailTitleRichText?: string;
  description: string;
  descriptionRichText?: string;
  quote: string;
  quoteRichText?: string;
  subtitle: string;
  subtitleRichText?: string;
  transcript: string;
  transcriptRichText?: string;
  actions?: IssueAudioAction[];
}
interface IssueModule { id: string; type: IssueModuleType; order: number; enabled: boolean; tracks?: IssueAudioTrack[]; [key: string]: unknown }
interface IssueDraftContent { sections: IssueModule[]; discussion: DiscussionContent }

const issueRichTextFields: Record<IssueModuleType, string[]> = {
  issueMeta: ['eyebrow', 'month'],
  coverStory: ['captionLeft', 'captionRight', 'eyebrow', 'title', 'body', 'byline'],
  cover: ['captionLeft', 'captionRight'],
  opener: ['eyebrow', 'title', 'body'],
  story: ['eyebrow', 'title', 'body', 'captionLeft', 'captionRight', 'detailCaptionLeft', 'detailCaptionRight', 'detailSource', 'detailParagraph1', 'detailParagraph2', 'detailQuote'],
  storyAction: ['title', 'body'],
  image: ['caption'],
  quote: ['text', 'attribution'],
  audio: ['title', 'detailTitle', 'description', 'quote', 'subtitle', 'transcript'],
  question: ['eyebrow', 'title', 'body'],
  observationAction: ['title', 'body'],
  sharedPracticeAction: ['title', 'body'],
  contents: ['title', 'entry1Label', 'entry1Summary', 'entry2Label', 'entry2Summary', 'entry3Label', 'entry3Summary', 'entry4Label', 'entry4Summary'],
  archive: ['title', 'entryLabel', 'entryTitle'],
  brandFooter: ['title', 'body'],
};
const issueAudioTrackRichTextFields = ['title', 'detailTitle', 'description', 'quote', 'subtitle', 'transcript'] as const;

function issueRichTextMaximum(field: string) {
  return ['body', 'transcript', 'description', 'detailParagraph1', 'detailParagraph2', 'detailQuote'].includes(field) ? 6000 : 500;
}

function withIssueRichTextFields(fields: string[]) {
  return fields.flatMap((field) => [field, `${field}RichText`]);
}

class IssueDto {
  @IsString() @MinLength(2) @MaxLength(64) code!: string;
  @IsString() @MinLength(2) @MaxLength(80) label!: string;
  @IsString() @MinLength(2) @MaxLength(40) month!: string;
  @IsString() @MinLength(2) @MaxLength(200) theme!: string;
  @IsString() @MinLength(2) @MaxLength(500) question!: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) labelRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) monthRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) themeRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) questionRichText?: string;
  @IsOptional() @IsString() @MaxLength(120) microVoiceTitle?: string;
  @IsOptional() @IsString() @MaxLength(20) microVoiceDuration?: string;
  @IsOptional() @IsString() @MaxLength(512) coverObjectKey?: string;
  @IsOptional() @IsString() @MaxLength(512) microVoiceObjectKey?: string;
  @IsOptional() @IsString() @MaxLength(512) homeBackgroundObjectKey?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeMetaRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(12) @Max(48) homeMetaFontSize?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) homeMetaColor?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionLeft?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeCoverCaptionLeftRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionRight?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeCoverCaptionRightRichText?: string;
  @IsOptional() @IsObject() draftContent?: IssueDraftContent;
}

class UpdateIssueDto {
  @IsInt() @Min(1) editVersion!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(64) code?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(80) label?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(40) month?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(200) theme?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(2) @MaxLength(500) question?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) labelRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) monthRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) themeRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) questionRichText?: string;
  @IsOptional() @IsString() @MaxLength(120) microVoiceTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(20) microVoiceDuration?: string | null;
  @IsOptional() @IsString() @MaxLength(512) coverObjectKey?: string | null;
  @IsOptional() @IsString() @MaxLength(512) microVoiceObjectKey?: string | null;
  @IsOptional() @IsString() @MaxLength(512) homeBackgroundObjectKey?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeMetaRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() @Min(12) @Max(48) homeMetaFontSize?: number;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) homeMetaColor?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionLeft?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeCoverCaptionLeftRichText?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(80) homeCoverCaptionRight?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(24000) homeCoverCaptionRightRichText?: string;
  @IsOptional() @IsObject() draftContent?: IssueDraftContent;
}

class IssueLifecycleDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsIn(['archived', 'draft']) status!: 'archived' | 'draft';
}

class DeleteIssueDto {
  @IsInt() @Min(1) editVersion!: number;
}

class MediaUploadDto {
  @IsString() @MinLength(1) @MaxLength(200) fileName!: string;
  @IsString() @MinLength(1) @MaxLength(100) contentType!: string;
  @IsInt() @Min(1) fileSize!: number;
  @IsIn(['image', 'audio', 'video']) kind!: 'image' | 'audio' | 'video';
}

class MediaDeleteDto {
  @IsString() @MaxLength(512) objectKey!: string;
  @IsIn(['orphan', 'temporary']) purpose!: 'orphan' | 'temporary';
  @IsOptional() @IsString() @MaxLength(4096) cleanupToken?: string;
}

class PracticeEntryDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,63}$/) key!: PracticeEntryKey;
  @IsOptional() @IsString() @Matches(/^(observation|shared-practice|daily-goods|none)$/) target?: string;
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsString() @MinLength(1) @MaxLength(240) description!: string;
  @IsOptional() @IsString() @MaxLength(2000) contextRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) contextFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) contextColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) titleRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) titleFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) titleColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) descriptionRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) descriptionFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) descriptionColor?: string;
  @IsBoolean() enabled!: boolean;
}

class ObservationCopyItemDto {
  @IsString() @MaxLength(2000) richText!: string;
  @IsInt() @Min(10) @Max(48) fontSize!: number;
  @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) color!: string;
}

class RealityStageCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) title?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) description?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) inputLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) placeholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footer?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class RealityStagesCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RealityStageCopyDto) situation?: RealityStageCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RealityStageCopyDto) body?: RealityStageCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RealityStageCopyDto) need?: RealityStageCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RealityStageCopyDto) nextAction?: RealityStageCopyDto;
}

class SeasonIntroCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) navTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) heroTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) heroDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideRequired?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideRead?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideParagraphOne?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideParagraphTwo?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideSteps?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideGateNote?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) guideConfirm?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) birthdayLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) monthLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) dayLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) monthPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) dayPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) birthdayNote?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) rememberTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) rememberNote?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) primaryAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) primaryLockedAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) skipAction?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class SeasonRelationOptionDto {
  @IsString() @IsIn(['resonates', 'partial', 'different', 'unclear']) key!: 'resonates' | 'partial' | 'different' | 'unclear';
  @ValidateNested() @Type(() => ObservationCopyItemDto) label!: ObservationCopyItemDto;
}

class SeasonStateOptionDto {
  @IsString() @IsIn(['生', '长', '收', '藏', '暂时说不清']) key!: '生' | '长' | '收' | '藏' | '暂时说不清';
  @ValidateNested() @Type(() => ObservationCopyItemDto) label!: ObservationCopyItemDto;
  @ValidateNested() @Type(() => ObservationCopyItemDto) hint!: ObservationCopyItemDto;
}

class SeasonCardCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) birthdayLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) emptyLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) chooseBirthday?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) changeBirthday?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) eyebrow?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) themePrefix?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footnote?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) noteLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) sourceToggle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footer?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class SeasonNowRecentCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) description?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) experienceLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) experiencePlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) relationLabel?: ObservationCopyItemDto;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(4) @ValidateNested({ each: true }) @Type(() => SeasonRelationOptionDto) relations?: SeasonRelationOptionDto[];
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) noteLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) optionalLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) notePlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
}

class SeasonNowChangeCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) description?: ObservationCopyItemDto;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @ValidateNested({ each: true }) @Type(() => SeasonStateOptionDto) states?: SeasonStateOptionDto[];
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) insightLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) optionalLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) insightPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footer?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
}

class SeasonNowCopyDto {
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonNowRecentCopyDto) recent?: SeasonNowRecentCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonNowChangeCopyDto) change?: SeasonNowChangeCopyDto;
}

class SeasonChoiceCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) leadLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) leadLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) keepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) keepPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) rejectLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) optionalLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) rejectPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footer?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class SeasonActionCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) titleLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) leadLine1?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) leadLine2?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) actionLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) actionPlaceholder?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) restLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previewLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previewEmpty?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) footer?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) nextLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) previousLabel?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class SeasonStagesCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonCardCopyDto) card?: SeasonCardCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonNowCopyDto) now?: SeasonNowCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonChoiceCopyDto) choice?: SeasonChoiceCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonActionCopyDto) action?: SeasonActionCopyDto;
}

class ObservationRecordCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) navTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) methodReality?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) methodSeason?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) statusDraft?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) statusSaved?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageBase?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageNow?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageChoice?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonActionTail?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) experienceLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) changeLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) keepLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) keepLabelOptional?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) stageRejectLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) perspectiveLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) perspectiveNote?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) editAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) againAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) deleteAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) deletingAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) emptyValue?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) perspectiveEmpty?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonCardSubtitle?: ObservationCopyItemDto;
  @IsOptional() @IsIn(['left', 'center', 'right']) align?: 'left' | 'center' | 'right';
  @IsOptional() @IsIn(['compact', 'standard', 'roomy']) spacing?: 'compact' | 'standard' | 'roomy';
}

class PracticeFooterCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) brand?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) line1?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) label?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) line2?: ObservationCopyItemDto;
}

class ObservationCopyDto {
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) introTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) introDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityContext?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) realityAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonContext?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonTitle?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonDescription?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonGuide?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) seasonAction?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyLabel?: ObservationCopyItemDto;
  @IsOptional() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => RealityStagesCopyDto) realityStages?: RealityStagesCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonIntroCopyDto) seasonIntro?: SeasonIntroCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeasonStagesCopyDto) seasonStages?: SeasonStagesCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationRecordCopyDto) record?: ObservationRecordCopyDto;
}

class SharedPracticeCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) topbarTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroIntro?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineContext?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineIssueLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineIssueTheme?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) onlineQuestion?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineContext?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) offlineCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) noticeLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) noticeCode?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule1Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule2Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule3Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Number?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Title?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) rule4Copy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) nextAction?: ObservationCopyItemDto;
}

class PrivacyPageCopyDto {
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) topbarTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaLeft?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) metaRight?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) heroIntro?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) privacyStatus?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) methodAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderNumber?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) reminderAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) aboutAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localLabel?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localAction?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) localConfirm?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) footerCopy?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) policyTitle?: ObservationCopyItemDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyItemDto) policyCopy?: ObservationCopyItemDto;
}

class PrivacyPageContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsObject() @ValidateNested() @Type(() => PrivacyPageCopyDto) copy!: PrivacyPageCopyDto;
}

class AboutPageDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(6000) brandIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) contentSources!: string;
  @IsString() @MinLength(1) @MaxLength(6000) contactInfo!: string;
}

class PracticeContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(80) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) titleRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) titleFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) titleColor?: string;
  @IsString() @MinLength(1) @MaxLength(240) intro!: string;
  @IsOptional() @IsString() @MaxLength(2000) introRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) introFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) introColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) metaLeftRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) metaLeftFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) metaLeftColor?: string;
  @IsOptional() @IsString() @MaxLength(2000) metaRightRichText?: string;
  @IsOptional() @IsInt() @Min(10) @Max(48) metaRightFontSize?: number;
  @IsOptional() @IsString() @Matches(/^#[0-9a-fA-F]{6}$/) metaRightColor?: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => ObservationCopyDto) observationCopy?: ObservationCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SharedPracticeCopyDto) sharedPracticeCopy?: SharedPracticeCopyDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => PracticeFooterCopyDto) footerCopy?: PracticeFooterCopyDto;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PracticeEntryDto) entries!: PracticeEntryDto[];
}

class DailyObjectProductDto {
  @IsString() @Matches(/^[a-z0-9][a-z0-9-]{1,31}$/) id!: string;
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(80) english!: string;
  @IsString() @MinLength(1) @MaxLength(2048) image!: string;
  @IsString() @MaxLength(40) price!: string;
  @IsString() @MaxLength(80) priceLabel!: string;
  @IsString() @MinLength(1) @MaxLength(1000) description!: string;
  @IsString() @MaxLength(1000) optionDetails!: string;
  @IsString() @MaxLength(1000) dailyUseDetails!: string;
  @IsString() @MaxLength(1000) deliveryDetails!: string;
  @IsBoolean() enabled!: boolean;
}

class DailyObjectsContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(80) brandName!: string;
  @IsString() @MaxLength(80) brandSubtitle!: string;
  @IsString() @MaxLength(120) bagLabel!: string;
  @IsString() @MaxLength(40) bagCount!: string;
  @IsString() @MaxLength(80) eyebrow!: string;
  @IsString() @MinLength(1) @MaxLength(120) title!: string;
  @IsString() @MinLength(1) @MaxLength(500) intro!: string;
  @IsString() @MaxLength(300) previewNote!: string;
  @IsString() @MaxLength(120) supportLabel!: string;
  @IsString() @MaxLength(500) landingTitle!: string;
  @IsString() @MaxLength(500) landingIntro!: string;
  @IsString() @MaxLength(120) landingStatus!: string;
  @IsString() @MaxLength(80) herDaysTitle!: string;
  @IsString() @MaxLength(80) herDaysEnglish!: string;
  @IsString() @MaxLength(80) articleLabel!: string;
  @IsString() @MaxLength(200) articleTitle!: string;
  @IsString() @MaxLength(1000) articleExcerpt!: string;
  @IsString() @MaxLength(2048) articleImage!: string;
  @IsString() @MaxLength(120) articleImageAlt!: string;
  @IsString() @MaxLength(300) articleCaption!: string;
  @IsString() @MaxLength(2048) officialArticleUrl!: string;
  @IsString() @MaxLength(120) officialArticleButton!: string;
  @IsString() @MaxLength(80) everydayObjectsTitle!: string;
  @IsString() @MaxLength(80) everydayObjectsEnglish!: string;
  @IsString() @MaxLength(500) everydayObjectsIntro!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DailyObjectProductDto) products!: DailyObjectProductDto[];
}

const dailyObjectsCopyDefaults = {
  landingTitle: '物不是答案。\n它只在日常里，\n支持一个动作发生。',
  landingIntro: '这些物从具体的使用场景出发，帮助一个动作变得更容易，而不是替生活提供答案。',
  landingStatus: '正在研究 · 尚未开放',
  herDaysTitle: '她的日常',
  herDaysEnglish: 'HER DAYS',
  articleLabel: '日常文章节选',
  articleTitle: '',
  articleExcerpt: '',
  articleImage: '',
  articleImageAlt: '人物日常图片',
  articleCaption: '',
  officialArticleUrl: '',
  officialArticleButton: '前往公众号阅读完整文章',
  everydayObjectsTitle: '日常好物探索',
  everydayObjectsEnglish: 'EVERYDAY OBJECTS',
  everydayObjectsIntro: '基于观察到的人物日常，对日常好物的思考及探索。',
} as const;

const intentionallyBlankDailyObjectsCopyKeys = new Set<keyof typeof dailyObjectsCopyDefaults>([
  'articleTitle',
  'articleExcerpt',
  'articleImage',
  'articleCaption',
  'officialArticleUrl',
]);

function normalizeDailyObjectsContent(raw: unknown, editVersion: number) {
  const content = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const products: Array<Record<string, unknown>> = Array.isArray(content.products) ? content.products.filter((item) => item && typeof item === 'object' && !Array.isArray(item)).map((item) => ({
    ...(item as Record<string, unknown>),
    optionDetails: typeof (item as Record<string, unknown>).optionDetails === 'string' ? (item as Record<string, unknown>).optionDetails : '',
    dailyUseDetails: typeof (item as Record<string, unknown>).dailyUseDetails === 'string' ? (item as Record<string, unknown>).dailyUseDetails : '',
    deliveryDetails: typeof (item as Record<string, unknown>).deliveryDetails === 'string' ? (item as Record<string, unknown>).deliveryDetails : '',
  })) : [];
  const copy = Object.fromEntries(Object.entries(dailyObjectsCopyDefaults).map(([key, fallback]) => {
    const value = typeof content[key] === 'string' ? (content[key] as string).trim() : '';
    const preserveBlank = intentionallyBlankDailyObjectsCopyKeys.has(key as keyof typeof dailyObjectsCopyDefaults);
    return [key, value || (preserveBlank ? '' : fallback)];
  })) as Record<keyof typeof dailyObjectsCopyDefaults, string>;
  return { ...content, ...copy, editVersion, products };
}

class MinePageContentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsString() @MinLength(1) @MaxLength(6000) title!: string;
  @IsString() @MinLength(1) @MaxLength(6000) intro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) observationHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) emptyTitle!: string;
  @IsString() @MinLength(1) @MaxLength(6000) emptyIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) startButton!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionCount!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionEmptyAction!: string;
  @IsString() @MinLength(1) @MaxLength(6000) discussionIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceCount!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceEmptyTitle!: string;
  @IsString() @MinLength(1) @MaxLength(6000) practiceIntro!: string;
  @IsString() @MinLength(1) @MaxLength(6000) privacyHeading!: string;
  @IsString() @MinLength(1) @MaxLength(6000) privacyAction!: string;
}

const minePageRichTextFields = [
  ['title', 100], ['intro', 240], ['observationHeading', 60], ['emptyTitle', 100], ['emptyIntro', 240], ['startButton', 60],
  ['discussionHeading', 60], ['discussionCount', 60], ['discussionEmptyAction', 100], ['discussionIntro', 240],
  ['practiceHeading', 60], ['practiceCount', 60], ['practiceEmptyTitle', 100], ['practiceIntro', 240],
  ['privacyHeading', 60], ['privacyAction', 60],
] as const;

function sanitizeMinePageRichText(value: unknown, maximumCharacters: number, label: string) {
  return sanitizeRichText(value, maximumCharacters, label, {
    minFontSize: 10,
    maxFontSize: 48,
    maxHtmlCharacters: 6000,
  });
}

function sanitizeMinePageContentFields<T extends Record<string, unknown>>(fields: T): T {
  const sanitized = { ...fields };
  const mutable = sanitized as Record<string, unknown>;
  for (const [key, maximumCharacters] of minePageRichTextFields) {
    if (key in mutable) mutable[key] = sanitizeMinePageRichText(mutable[key], maximumCharacters, key);
  }
  return sanitized;
}
const realityStageKeys = ['situation', 'body', 'need', 'nextAction'] as const;
type RealityStageKey = typeof realityStageKeys[number];
type RealityStageSpacing = 'compact' | 'standard' | 'roomy';
const seasonIntroCopyKeys = [
  'navTitle', 'metaLeft', 'metaRight', 'heroTitle', 'heroDescription', 'guideTitle', 'guideRequired', 'guideRead',
  'guideParagraphOne', 'guideParagraphTwo', 'guideSteps', 'guideGateNote', 'guideConfirm', 'birthdayLabel',
  'monthLabel', 'dayLabel', 'monthPlaceholder', 'dayPlaceholder', 'birthdayNote', 'rememberTitle', 'rememberNote',
  'primaryAction', 'primaryLockedAction', 'realityAction', 'skipAction',
] as const;
type SeasonIntroCopyKey = typeof seasonIntroCopyKeys[number];
type SeasonIntroSpacing = 'compact' | 'standard' | 'roomy';
const seasonCardCopyKeys = [
  'stageLabel', 'birthdayLabel', 'emptyLabel', 'chooseBirthday', 'changeBirthday', 'eyebrow', 'themePrefix',
  'footnote', 'noteLabel', 'sourceToggle', 'nextLabel', 'previousLabel', 'footer',
] as const;
type SeasonCardCopyKey = typeof seasonCardCopyKeys[number];
const seasonNowRecentCopyKeys = [
  'stepLabel', 'titleLine1', 'titleLine2', 'description', 'experienceLabel', 'experiencePlaceholder',
  'relationLabel', 'noteLabel', 'optionalLabel', 'notePlaceholder', 'nextLabel', 'previousLabel',
] as const;
type SeasonNowRecentCopyKey = typeof seasonNowRecentCopyKeys[number];
const seasonNowChangeCopyKeys = [
  'stepLabel', 'titleLine1', 'titleLine2', 'description', 'insightLabel', 'optionalLabel',
  'insightPlaceholder', 'footer', 'nextLabel', 'previousLabel',
] as const;
type SeasonNowChangeCopyKey = typeof seasonNowChangeCopyKeys[number];
const seasonChoiceCopyKeys = [
  'stepLabel', 'titleLine1', 'titleLine2', 'leadLine1', 'leadLine2', 'keepLabel', 'keepPlaceholder',
  'rejectLabel', 'optionalLabel', 'rejectPlaceholder', 'nextLabel', 'previousLabel', 'footer',
] as const;
type SeasonChoiceCopyKey = typeof seasonChoiceCopyKeys[number];
const seasonActionCopyKeys = [
  'stepLabel', 'titleLine1', 'titleLine2', 'leadLine1', 'leadLine2', 'actionLabel', 'actionPlaceholder',
  'restLabel', 'previewLabel', 'previewEmpty', 'footer', 'nextLabel', 'previousLabel',
] as const;
type SeasonActionCopyKey = typeof seasonActionCopyKeys[number];
const seasonRelationKeys = ['resonates', 'partial', 'different', 'unclear'] as const;
type SeasonRelationKey = typeof seasonRelationKeys[number];
const seasonRelationLegacyLabels: Record<SeasonRelationKey, string> = {
  resonates: '有共鸣',
  partial: '部分有关',
  different: '与我的经验不同',
  unclear: '暂时说不清',
};
const seasonStateKeys = ['生', '长', '收', '藏', '暂时说不清'] as const;
type SeasonStateKey = typeof seasonStateKeys[number];
const observationRecordCopyKeys = [
  'navTitle', 'methodReality', 'methodSeason', 'statusDraft', 'statusSaved', 'stageBase', 'stageNow', 'stageChoice',
  'stageAction', 'seasonActionTail', 'experienceLabel', 'changeLabel', 'keepLabel', 'keepLabelOptional', 'stageRejectLabel',
  'perspectiveLabel', 'perspectiveNote', 'perspectiveEmpty', 'editAction', 'againAction', 'deleteAction', 'deletingAction',
  'emptyValue', 'seasonCardSubtitle',
] as const;
type ObservationRecordCopyKey = typeof observationRecordCopyKeys[number];
const defaultObservationCopy = {
  metaLeft: { richText: '此刻归安', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'PRIVATE PRACTICE', fontSize: 12, color: '#663124' },
  introTitle: { richText: '先把正在发生的事，<br/>放在眼前。', fontSize: 28, color: '#663124' },
  introDescription: { richText: '辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。', fontSize: 14, color: '#40362f' },
  realityContext: { richText: '从经验出发', fontSize: 12, color: '#8b6b58' },
  realityTitle: { richText: '从现实处境开始', fontSize: 22, color: '#663124' },
  realityDescription: { richText: '沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。', fontSize: 14, color: '#40362f' },
  realityAction: { richText: '开始观察', fontSize: 14, color: '#663124' },
  seasonContext: { richText: '换一个观察角度', fontSize: 12, color: '#8b6b58' },
  seasonTitle: { richText: '从四时气韵开始', fontSize: 22, color: '#663124' },
  seasonDescription: { richText: '从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。', fontSize: 14, color: '#40362f' },
  seasonGuide: { richText: '先了解四时气韵是什么', fontSize: 13, color: '#663124' },
  seasonAction: { richText: '了解方法并开始', fontSize: 14, color: '#663124' },
  privacyLabel: { richText: '仅自己可见', fontSize: 13, color: '#663124' },
  privacyCopy: { richText: '所有观察默认私密。你可以修改、删除或随时停止。', fontSize: 12, color: '#76695f' },
  realityStages: {
    situation: {
      stageLabel: { richText: '底色', fontSize: 11, color: '#663124' },
      title: { richText: '此刻，真实发生了什么？', fontSize: 27, color: '#663124' },
      description: { richText: '只写事实也可以，不急着解释。', fontSize: 14, color: '#40362f' },
      inputLabel: { richText: '写下这一刻', fontSize: 12, color: '#8b6b58' },
      placeholder: { richText: '例如：这周我反复答应了原本不想接下的事……', fontSize: 14, color: '#40362f' },
      nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as RealityStageSpacing,
    },
    body: {
      stageLabel: { richText: '此刻', fontSize: 11, color: '#663124' },
      title: { richText: '你现在最明显的感受是什么？', fontSize: 27, color: '#663124' },
      description: { richText: '可以是一种情绪、身体感受，或“暂时说不清”。', fontSize: 14, color: '#40362f' },
      inputLabel: { richText: '或者，用自己的话写下', fontSize: 12, color: '#8b6b58' },
      placeholder: { richText: '把最接近此刻的感受写下来……', fontSize: 14, color: '#40362f' },
      nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as RealityStageSpacing,
    },
    need: {
      stageLabel: { richText: '选择', fontSize: 11, color: '#663124' },
      title: { richText: '此刻，你愿意把选择权放在哪里？', fontSize: 27, color: '#663124' },
      description: { richText: '不是解决全部，只是辨认一个现在可以选择的方向。', fontSize: 14, color: '#40362f' },
      inputLabel: { richText: '或者，用自己的话写下', fontSize: 12, color: '#8b6b58' },
      placeholder: { richText: '例如：今天先不回复，明早再决定……', fontSize: 14, color: '#40362f' },
      nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as RealityStageSpacing,
    },
    nextAction: {
      stageLabel: { richText: '行动', fontSize: 11, color: '#663124' },
      title: { richText: '接下来七天，你愿意做哪一件小事？', fontSize: 27, color: '#663124' },
      description: { richText: '让它小到真的可以发生。', fontSize: 14, color: '#40362f' },
      inputLabel: { richText: '写下这一件小事', fontSize: 12, color: '#8b6b58' },
      placeholder: { richText: '例如：把那句话写下来，先不发送……', fontSize: 14, color: '#40362f' },
      nextLabel: { richText: '私密保存这次观察', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as RealityStageSpacing,
    },
  },
  seasonIntro: {
    navTitle: { richText: '四时气韵', fontSize: 15, color: '#4a3f38' },
    metaLeft: { richText: '四时气韵', fontSize: 11, color: '#8b6b58' },
    metaRight: { richText: '从生命牌开始', fontSize: 11, color: '#7b5a45' },
    heroTitle: { richText: '从一个生日，<br/>开启一次观察。', fontSize: 29, color: '#4a3f38' },
    heroDescription: { richText: '按生日找到对应的生命牌，借它的主题回看一件真实的事，再辨认其中的变化与自己的选择。', fontSize: 14, color: '#4a3f38' },
    guideTitle: { richText: '生命牌与四时气韵是什么？', fontSize: 16, color: '#4a3f38' },
    guideRequired: { richText: '必读', fontSize: 10, color: '#663124' },
    guideRead: { richText: '已读', fontSize: 10, color: '#8b6b58' },
    guideParagraphOne: { richText: '生命牌来自一种以生日对应纸牌的传统符号体系。在这里，MYRIAD SHE 把其中的主题转成观察问题，再借“生、长、收、藏”辨认一件具体的事正在怎样变化。', fontSize: 13, color: '#5b4c42' },
    guideParagraphTwo: { richText: '生日只用于查表。牌义不决定你是谁，也不能替你判断此刻的状态。你可以保留不同的经验与解释。', fontSize: 13, color: '#5b4c42' },
    guideSteps: { richText: '底色 → 此刻 → 选择 → 行动', fontSize: 12, color: '#7b5a45' },
    guideGateNote: { richText: '开始前，请先阅读以上说明并确认了解。', fontSize: 11, color: '#7b5a45' },
    guideConfirm: { richText: '我已了解，开始选择生日', fontSize: 14, color: '#fffaf4' },
    birthdayLabel: { richText: '你的公历生日', fontSize: 13, color: '#4a3f38' },
    monthLabel: { richText: '月', fontSize: 11, color: '#8b6b58' },
    dayLabel: { richText: '日', fontSize: 11, color: '#8b6b58' },
    monthPlaceholder: { richText: '选择月份', fontSize: 15, color: '#a1907f' },
    dayPlaceholder: { richText: '选择日期', fontSize: 15, color: '#a1907f' },
    birthdayNote: { richText: '只需月与日。同一天生日对应同一张生命牌。', fontSize: 11, color: '#8b6b58' },
    rememberTitle: { richText: '在这台设备记住生日', fontSize: 13, color: '#4a3f38' },
    rememberNote: { richText: '下次可直接继续观察；随时可以清除。', fontSize: 11, color: '#8b6b58' },
    primaryAction: { richText: '查看我的生命牌', fontSize: 15, color: '#fffaf4' },
    primaryLockedAction: { richText: '请先阅读并确认了解', fontSize: 15, color: '#fffaf4' },
    realityAction: { richText: '从现实处境开始', fontSize: 14, color: '#4a3f38' },
    skipAction: { richText: '暂不使用四时气韵', fontSize: 13, color: '#8b6b58' },
    align: 'left' as const,
    spacing: 'standard' as SeasonIntroSpacing,
  },
  seasonStages: {
    card: {
      stageLabel: { richText: '按生日对应的生命牌', fontSize: 11, color: '#8b6b58' },
      birthdayLabel: { richText: '生日', fontSize: 11, color: '#8b6b58' },
      emptyLabel: { richText: '还没有选择生日。', fontSize: 14, color: '#8b6b58' },
      chooseBirthday: { richText: '选择生日', fontSize: 13, color: '#663124' },
      changeBirthday: { richText: '修改生日', fontSize: 11, color: '#8b6b58' },
      eyebrow: { richText: 'MYRIAD SHE · 底色观察', fontSize: 10, color: '#8b6b58' },
      themePrefix: { richText: '可以留意 · ', fontSize: 12, color: '#7b5a45' },
      footnote: { richText: '这是一个观察角度。哪些与你有关，由你的经验决定。', fontSize: 11, color: '#8b6b58' },
      noteLabel: { richText: '传统线索 · 注', fontSize: 11, color: '#7b5a45' },
      sourceToggle: { richText: '释义来源与使用说明', fontSize: 11, color: '#663124' },
      nextLabel: { richText: '回到一件真实的事', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as SeasonIntroSpacing,
    },
    now: {
      align: 'left' as const,
      spacing: 'standard' as SeasonIntroSpacing,
      recent: {
        stepLabel: { richText: '02 / 04 · 此刻', fontSize: 11, color: '#8b6b58' },
        titleLine1: { richText: '最近，', fontSize: 28, color: '#663124' },
        titleLine2: { richText: '发生了什么？', fontSize: 28, color: '#663124' },
        description: { richText: '先从一件具体的事开始。它可以呼应前面的线索，也可以与你读到的完全不同。', fontSize: 14, color: '#40362f' },
        experienceLabel: { richText: '这件事是怎样发生的？', fontSize: 12, color: '#8b6b58' },
        experiencePlaceholder: { richText: '最近，在……的时候，发生了……', fontSize: 14, color: '#40362f' },
        relationLabel: { richText: '前面的底色，与你的经验有关吗？', fontSize: 12, color: '#8b6b58' },
        relations: [
          { key: 'resonates' as const, label: { richText: '有共鸣', fontSize: 12, color: '#40362f' } },
          { key: 'partial' as const, label: { richText: '部分有关', fontSize: 12, color: '#40362f' } },
          { key: 'different' as const, label: { richText: '与我的经验不同', fontSize: 12, color: '#40362f' } },
          { key: 'unclear' as const, label: { richText: '暂时说不清', fontSize: 12, color: '#40362f' } },
        ],
        noteLabel: { richText: '哪些有关，哪些不同？', fontSize: 12, color: '#8b6b58' },
        optionalLabel: { richText: '选填', fontSize: 10, color: '#8b6b58' },
        notePlaceholder: { richText: '用自己的话补充，也可以留空。', fontSize: 14, color: '#40362f' },
        nextLabel: { richText: '看看这件事的变化', fontSize: 14, color: '#663124' },
        previousLabel: { richText: '回看底色', fontSize: 14, color: '#663124' },
      },
      change: {
        stepLabel: { richText: '02 / 04 · 此刻的变化', fontSize: 11, color: '#8b6b58' },
        titleLine1: { richText: '这件事，', fontSize: 28, color: '#663124' },
        titleLine2: { richText: '正在怎样变化？', fontSize: 28, color: '#663124' },
        description: { richText: '借四时的变化，回看刚才的事。几种状态可以同时存在，也可以暂时说不清。', fontSize: 14, color: '#40362f' },
        states: [
          { key: '生' as const, label: { richText: '正在开始', fontSize: 14, color: '#40362f' }, hint: { richText: '什么正在开始？', fontSize: 12, color: '#8b6b58' } },
          { key: '长' as const, label: { richText: '继续培育', fontSize: 14, color: '#40362f' }, hint: { richText: '什么值得继续培育？', fontSize: 12, color: '#8b6b58' } },
          { key: '收' as const, label: { richText: '完成与取舍', fontSize: 14, color: '#40362f' }, hint: { richText: '什么需要完成、取舍或收束？', fontSize: 12, color: '#8b6b58' } },
          { key: '藏' as const, label: { richText: '暂停与保存', fontSize: 14, color: '#40362f' }, hint: { richText: '什么需要暂停、休息与保存？', fontSize: 12, color: '#8b6b58' } },
          { key: '暂时说不清' as const, label: { richText: '暂时说不清', fontSize: 14, color: '#40362f' }, hint: { richText: '也可以不急着归类。', fontSize: 12, color: '#8b6b58' } },
        ],
        insightLabel: { richText: '对这件事，你还看见了什么？', fontSize: 12, color: '#8b6b58' },
        optionalLabel: { richText: '选填', fontSize: 10, color: '#8b6b58' },
        insightPlaceholder: { richText: '例如：项目刚开始，但我已经需要给自己留出休息。', fontSize: 14, color: '#40362f' },
        footer: { richText: '这里辨认的是一件事中的变化，不是为你确定一个季节身份。', fontSize: 11, color: '#76695f' },
        nextLabel: { richText: '带着自己的理解继续', fontSize: 14, color: '#663124' },
        previousLabel: { richText: '回到这件事', fontSize: 14, color: '#663124' },
      },
    },
    choice: {
      stepLabel: { richText: '03 / 04 · 选择', fontSize: 11, color: '#8b6b58' },
      titleLine1: { richText: '哪些解释，', fontSize: 28, color: '#663124' },
      titleLine2: { richText: '你愿意留下？', fontSize: 28, color: '#663124' },
      leadLine1: { richText: '可以保留一个问题，拒绝一种解释，', fontSize: 14, color: '#40362f' },
      leadLine2: { richText: '也可以用自己的方式重新理解这件事。', fontSize: 14, color: '#40362f' },
      keepLabel: { richText: '我想保留的', fontSize: 12, color: '#916162' },
      keepPlaceholder: { richText: '这次观察里，对我有用的是……', fontSize: 14, color: '#40362f' },
      rejectLabel: { richText: '我不接受的，或另一种理解', fontSize: 12, color: '#916162' },
      optionalLabel: { richText: '· 选填', fontSize: 10, color: '#916162' },
      rejectPlaceholder: { richText: '我不认同……；对我来说，也可能是……', fontSize: 14, color: '#40362f' },
      nextLabel: { richText: '想想接下来的行动', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '回看变化', fontSize: 14, color: '#663124' },
      footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
      align: 'left' as const,
      spacing: 'standard' as SeasonIntroSpacing,
    },
    action: {
      stepLabel: { richText: '04 / 04 · 行动', fontSize: 11, color: '#8b6b58' },
      titleLine1: { richText: '接下来七天，', fontSize: 28, color: '#663124' },
      titleLine2: { richText: '你愿意做什么？', fontSize: 28, color: '#663124' },
      leadLine1: { richText: '选一个小到能够发生的行动。休息、等待、', fontSize: 14, color: '#40362f' },
      leadLine2: { richText: '继续观察，也可以是此刻的选择。', fontSize: 14, color: '#40362f' },
      actionLabel: { richText: '我愿意做的一个最小行动', fontSize: 12, color: '#916162' },
      actionPlaceholder: { richText: '例如：本周找一个安静的晚上，把这事件重新读一次。', fontSize: 14, color: '#40362f' },
      restLabel: { richText: '先留一点时间，不安排新行动', fontSize: 13, color: '#40362f' },
      previewLabel: { richText: '这次留下的', fontSize: 11, color: '#8b6b58' },
      previewEmpty: { richText: '还没有写下具体的事', fontSize: 14, color: '#a4937f' },
      footer: { richText: '保存的是你写下的经验与判断，不会生成性格结论；以后可以修改或删除。', fontSize: 11, color: '#76695f' },
      nextLabel: { richText: '保存这次观察', fontSize: 14, color: '#663124' },
      previousLabel: { richText: '回看选择', fontSize: 14, color: '#663124' },
      align: 'left' as const,
      spacing: 'standard' as SeasonIntroSpacing,
    },
  },
  record: {
    navTitle: { richText: '观察记录', fontSize: 16, color: '#5c493c' },
    methodReality: { richText: '现实处境', fontSize: 12, color: '#8f4938' },
    methodSeason: { richText: '四时气韵', fontSize: 12, color: '#8f4938' },
    statusDraft: { richText: '草稿', fontSize: 12, color: '#8b6b58' },
    statusSaved: { richText: '此设备保存', fontSize: 12, color: '#8b6b58' },
    stageBase: { richText: '01 · 底色', fontSize: 12, color: '#8f4938' },
    stageNow: { richText: '02 · 此刻', fontSize: 12, color: '#8f4938' },
    stageChoice: { richText: '03 · 选择', fontSize: 12, color: '#8f4938' },
    stageAction: { richText: '04 · 行动', fontSize: 12, color: '#8f4938' },
    seasonActionTail: { richText: '· 接下来七天', fontSize: 12, color: '#8f4938' },
    experienceLabel: { richText: '我写下的经验', fontSize: 12, color: '#8f4938' },
    changeLabel: { richText: '我辨认的变化', fontSize: 12, color: '#8f4938' },
    keepLabel: { richText: '我想保留的', fontSize: 12, color: '#8f4938' },
    keepLabelOptional: { richText: '· 选填', fontSize: 12, color: '#8f4938' },
    stageRejectLabel: { richText: '我不接受的，或另一种理解', fontSize: 12, color: '#8f4938' },
    perspectiveLabel: { richText: '你对此线索引的判断', fontSize: 12, color: '#8f4938' },
    perspectiveNote: { richText: '这份判断可以随时修改；你的经验始终拥有解释权。', fontSize: 11, color: '#8b6b58' },
    perspectiveEmpty: { richText: '暂未作判断', fontSize: 14, color: '#3f352e' },
    editAction: { richText: '修改这次观察', fontSize: 14, color: '#fffaf4' },
    againAction: { richText: '再次观察', fontSize: 14, color: '#fffaf4' },
    deleteAction: { richText: '删除记录', fontSize: 14, color: '#fffaf4' },
    deletingAction: { richText: '正在删除…', fontSize: 14, color: '#fffaf4' },
    emptyValue: { richText: '未填写', fontSize: 13, color: '#a89a8c' },
    seasonCardSubtitle: { richText: '本次借用的品牌观察线索', fontSize: 12, color: '#5c493c' },
    align: 'left' as const,
    spacing: 'standard' as SeasonIntroSpacing,
  },
} as const;

type PracticeFooterCopyKey = 'brand' | 'line1' | 'label' | 'line2';
type PracticeFooterCopy = Record<PracticeFooterCopyKey, { richText: string; fontSize: number; color: string }>;
const practiceFooterCopyKeys: PracticeFooterCopyKey[] = ['brand', 'line1', 'label', 'line2'];
const defaultPracticeFooterCopy: PracticeFooterCopy = {
  brand: { richText: 'MYRIAD SHE', fontSize: 11, color: '#5c493c' },
  line1: { richText: '看见真实经验', fontSize: 16, color: '#40362f' },
  label: { richText: '此刻归安', fontSize: 11, color: '#5c493c' },
  line2: { richText: '让一件小事发生', fontSize: 16, color: '#40362f' },
};

function sanitizePracticeFooterCopy(raw: unknown): PracticeFooterCopy {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(practiceFooterCopyKeys.map((key) => {
    const fallback = defaultPracticeFooterCopy[key];
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      ? source[key] as Record<string, unknown>
      : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 80, `实践页页尾${key}`);
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
      ? Number(item.fontSize)
      : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  })) as PracticeFooterCopy;
}

const observationCopyFlatKeys = [
  'metaLeft', 'metaRight', 'introTitle', 'introDescription', 'realityContext', 'realityTitle', 'realityDescription', 'realityAction',
  'seasonContext', 'seasonTitle', 'seasonDescription', 'seasonGuide', 'seasonAction', 'privacyLabel', 'privacyCopy',
] as const;
const realityStageCopyKeys = ['stageLabel', 'title', 'description', 'inputLabel', 'placeholder', 'nextLabel', 'previousLabel', 'footer'] as const;
type ObservationCopyItemValue = { richText: string; fontSize: number; color: string };
type RealityStageCopyValue = Record<typeof realityStageCopyKeys[number], ObservationCopyItemValue> & {
  align: 'left' | 'center' | 'right';
  spacing: RealityStageSpacing;
};
type SeasonIntroCopyValue = Record<SeasonIntroCopyKey, ObservationCopyItemValue> & {
  align: 'left' | 'center' | 'right';
  spacing: SeasonIntroSpacing;
};
type SeasonCopyAlignment = 'left' | 'center' | 'right';
type SeasonCopySpacing = 'compact' | 'standard' | 'roomy';
type SeasonLayoutCopyValue = {
  align: SeasonCopyAlignment;
  spacing: SeasonCopySpacing;
};
type SeasonRelationOptionValue = { key: SeasonRelationKey; label: ObservationCopyItemValue };
type SeasonStateOptionValue = { key: SeasonStateKey; label: ObservationCopyItemValue; hint: ObservationCopyItemValue };
type SeasonCardCopyValue = Record<SeasonCardCopyKey, ObservationCopyItemValue> & SeasonLayoutCopyValue;
type SeasonNowRecentCopyValue = Record<SeasonNowRecentCopyKey, ObservationCopyItemValue> & {
  relations: SeasonRelationOptionValue[];
};
type SeasonNowChangeCopyValue = Record<SeasonNowChangeCopyKey, ObservationCopyItemValue> & {
  states: SeasonStateOptionValue[];
};
type SeasonChoiceCopyValue = Record<SeasonChoiceCopyKey, ObservationCopyItemValue> & SeasonLayoutCopyValue;
type SeasonActionCopyValue = Record<SeasonActionCopyKey, ObservationCopyItemValue> & SeasonLayoutCopyValue;
type SeasonNowCopyValue = SeasonLayoutCopyValue & {
  recent: SeasonNowRecentCopyValue;
  change: SeasonNowChangeCopyValue;
};
type SeasonStagesCopyValue = {
  card: SeasonCardCopyValue;
  now: SeasonNowCopyValue;
  choice: SeasonChoiceCopyValue;
  action: SeasonActionCopyValue;
};
type ObservationRecordCopyValue = Record<ObservationRecordCopyKey, ObservationCopyItemValue> & SeasonLayoutCopyValue;
type ObservationCopyValue = Record<typeof observationCopyFlatKeys[number], ObservationCopyItemValue> & {
  realityStages: Record<RealityStageKey, RealityStageCopyValue>;
  seasonIntro: SeasonIntroCopyValue;
  seasonStages: SeasonStagesCopyValue;
  record: ObservationRecordCopyValue;
};

function sanitizeObservationCopyItem(raw: unknown, fallback: ObservationCopyItemValue, label: string, stripFormatting: boolean) {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  let richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 500, label);
  if (stripFormatting) {
    richText = richText
      .replace(/<p\b[^>]*>/gi, '')
      .replace(/<\/p\s*>/gi, '<br/>')
      .replace(/<\/?(?:span|strong|b|em|i|u)\b[^>]*>/gi, '');
  }
  const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
    ? Number(item.fontSize)
    : fallback.fontSize;
  const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
  return { richText, fontSize, color };
}

function sanitizeSeasonLayout(source: Record<string, unknown>, fallback: SeasonLayoutCopyValue): SeasonLayoutCopyValue {
  const align = source.align === 'left' || source.align === 'center' || source.align === 'right'
    ? source.align
    : fallback.align;
  const spacing = source.spacing === 'compact' || source.spacing === 'standard' || source.spacing === 'roomy'
    ? source.spacing
    : fallback.spacing;
  return { align, spacing };
}

function sanitizeSeasonCopyFields<K extends string>(
  source: Record<string, unknown>,
  keys: readonly K[],
  fallback: Record<K, ObservationCopyItemValue>,
  label: string,
): Record<K, ObservationCopyItemValue> {
  return Object.fromEntries(keys.map((key) => [
    key,
    sanitizeObservationCopyItem(source[key], fallback[key], `${label}${key}`, false),
  ])) as Record<K, ObservationCopyItemValue>;
}

function seasonRelationKeyFromLegacy(value: unknown): SeasonRelationKey | null {
  if (typeof value !== 'string') return null;
  const plain = value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  const legacy = Object.entries(seasonRelationLegacyLabels).find(([, label]) => label === plain);
  return legacy ? legacy[0] as SeasonRelationKey : null;
}

function sanitizeSeasonRelations(raw: unknown, fallback: readonly SeasonRelationOptionValue[]): SeasonRelationOptionValue[] {
  const source = Array.isArray(raw) ? raw : [];
  return seasonRelationKeys.map((key) => {
    const fallbackOption = fallback.find((option) => option.key === key) || fallback[0];
    const matched = source.find((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return false;
      const record = option as Record<string, unknown>;
      return record.key === key || seasonRelationKeyFromLegacy(record.key) === key
        || seasonRelationKeyFromLegacy(record.label) === key;
    }) as Record<string, unknown> | undefined;
    return {
      key,
      label: sanitizeObservationCopyItem(matched?.label, fallbackOption.label, `四时气韵关系${key}`, false),
    };
  });
}

function sanitizeSeasonStates(raw: unknown, fallback: readonly SeasonStateOptionValue[]): SeasonStateOptionValue[] {
  const source = Array.isArray(raw) ? raw : [];
  return seasonStateKeys.map((key) => {
    const fallbackOption = fallback.find((option) => option.key === key) || fallback[0];
    const matched = source.find((option) => option && typeof option === 'object' && !Array.isArray(option)
      && (option as Record<string, unknown>).key === key) as Record<string, unknown> | undefined;
    return {
      key,
      label: sanitizeObservationCopyItem(matched?.label, fallbackOption.label, `四时气韵状态${key}名称`, false),
      hint: sanitizeObservationCopyItem(matched?.hint, fallbackOption.hint, `四时气韵状态${key}提示`, false),
    };
  });
}

function sanitizeObservationCopy(raw: unknown): ObservationCopyValue {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const flat = Object.fromEntries(observationCopyFlatKeys.map((key) => {
    const fallback = defaultObservationCopy[key];
    return [key, sanitizeObservationCopyItem(source[key], fallback, `此刻观察${key}`, true)];
  }));
  const rawStages = source.realityStages && typeof source.realityStages === 'object' && !Array.isArray(source.realityStages)
    ? source.realityStages as Record<string, unknown>
    : {};
  const realityStages = Object.fromEntries(realityStageKeys.map((stageKey) => {
    const fallback = defaultObservationCopy.realityStages[stageKey];
    const stageSource = rawStages[stageKey] && typeof rawStages[stageKey] === 'object' && !Array.isArray(rawStages[stageKey])
      ? rawStages[stageKey] as Record<string, unknown>
      : {};
    const copy = Object.fromEntries(realityStageCopyKeys.map((fieldKey) => [
      fieldKey,
      sanitizeObservationCopyItem(stageSource[fieldKey], fallback[fieldKey], `现实处境${stageKey}${fieldKey}`, false),
    ]));
    const { align, spacing } = sanitizeSeasonLayout(stageSource, fallback);
    return [stageKey, { ...copy, align, spacing }];
  }));
  const seasonIntroSource = source.seasonIntro && typeof source.seasonIntro === 'object' && !Array.isArray(source.seasonIntro)
    ? source.seasonIntro as Record<string, unknown>
    : {};
  const seasonIntroCopy = Object.fromEntries(seasonIntroCopyKeys.map((key) => [
    key,
    sanitizeObservationCopyItem(seasonIntroSource[key], defaultObservationCopy.seasonIntro[key], `四时气韵入口页${key}`, false),
  ]));
  const seasonIntroLayout = sanitizeSeasonLayout(seasonIntroSource, defaultObservationCopy.seasonIntro);
  const seasonIntro = { ...seasonIntroCopy, ...seasonIntroLayout } as SeasonIntroCopyValue;

  const rawSeasonStages = source.seasonStages && typeof source.seasonStages === 'object' && !Array.isArray(source.seasonStages)
    ? source.seasonStages as Record<string, unknown>
    : {};
  const defaultSeasonStages = defaultObservationCopy.seasonStages;
  const rawCard = rawSeasonStages.card && typeof rawSeasonStages.card === 'object' && !Array.isArray(rawSeasonStages.card)
    ? rawSeasonStages.card as Record<string, unknown>
    : {};
  const card = {
    ...sanitizeSeasonCopyFields(rawCard, seasonCardCopyKeys, defaultSeasonStages.card, '四时气韵底色'),
    ...sanitizeSeasonLayout(rawCard, defaultSeasonStages.card),
  } as SeasonCardCopyValue;

  const rawNow = rawSeasonStages.now && typeof rawSeasonStages.now === 'object' && !Array.isArray(rawSeasonStages.now)
    ? rawSeasonStages.now as Record<string, unknown>
    : {};
  const rawRecent = rawNow.recent && typeof rawNow.recent === 'object' && !Array.isArray(rawNow.recent)
    ? rawNow.recent as Record<string, unknown>
    : {};
  const recent = {
    ...sanitizeSeasonCopyFields(rawRecent, seasonNowRecentCopyKeys, defaultSeasonStages.now.recent, '四时气韵此刻最近'),
    relations: sanitizeSeasonRelations(rawRecent.relations, defaultSeasonStages.now.recent.relations),
  } as SeasonNowRecentCopyValue;
  const rawChange = rawNow.change && typeof rawNow.change === 'object' && !Array.isArray(rawNow.change)
    ? rawNow.change as Record<string, unknown>
    : {};
  const change = {
    ...sanitizeSeasonCopyFields(rawChange, seasonNowChangeCopyKeys, defaultSeasonStages.now.change, '四时气韵此刻变化'),
    states: sanitizeSeasonStates(rawChange.states, defaultSeasonStages.now.change.states),
  } as SeasonNowChangeCopyValue;
  const now = { ...sanitizeSeasonLayout(rawNow, defaultSeasonStages.now), recent, change } as SeasonNowCopyValue;

  const rawChoice = rawSeasonStages.choice && typeof rawSeasonStages.choice === 'object' && !Array.isArray(rawSeasonStages.choice)
    ? rawSeasonStages.choice as Record<string, unknown>
    : {};
  const choice = {
    ...sanitizeSeasonCopyFields(rawChoice, seasonChoiceCopyKeys, defaultSeasonStages.choice, '四时气韵选择'),
    ...sanitizeSeasonLayout(rawChoice, defaultSeasonStages.choice),
  } as SeasonChoiceCopyValue;
  const rawAction = rawSeasonStages.action && typeof rawSeasonStages.action === 'object' && !Array.isArray(rawSeasonStages.action)
    ? rawSeasonStages.action as Record<string, unknown>
    : {};
  const action = {
    ...sanitizeSeasonCopyFields(rawAction, seasonActionCopyKeys, defaultSeasonStages.action, '四时气韵行动'),
    ...sanitizeSeasonLayout(rawAction, defaultSeasonStages.action),
  } as SeasonActionCopyValue;
  const seasonStages: SeasonStagesCopyValue = { card, now, choice, action };
  const rawRecord = source.record && typeof source.record === 'object' && !Array.isArray(source.record)
    ? source.record as Record<string, unknown>
    : {};
  const record = {
    ...sanitizeSeasonCopyFields(rawRecord, observationRecordCopyKeys, defaultObservationCopy.record, '观察记录页'),
    ...sanitizeSeasonLayout(rawRecord, defaultObservationCopy.record),
  } as ObservationRecordCopyValue;
  return { ...flat, realityStages, seasonIntro, seasonStages, record } as ObservationCopyValue;
}

const defaultSharedPracticeCopy = {
  topbarTitle: { richText: '共同实践', fontSize: 16, color: '#5c493c' },
  metaLeft: { richText: '共同实践', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'WITH OTHERS', fontSize: 12, color: '#663124' },
  heroTitle: { richText: '一起谈谈，<br/>也在生活中相见。', fontSize: 28, color: '#5c493c' },
  heroIntro: { richText: '线上围绕本期问题，听见不同的经历；线下活动开启后，再在这里相见。', fontSize: 16, color: '#5c493c' },
  onlineContext: { richText: '线上 · 本期讨论', fontSize: 11, color: '#8b6b58' },
  onlineNumber: { richText: '01', fontSize: 11, color: '#8b6b58' },
  onlineCopy: { richText: '讲一个真实处境，也听听其他人如何理解自己的经验。', fontSize: 15, color: '#5c493c' },
  onlineAction: { richText: '一起谈谈', fontSize: 14, color: '#663124' },
  onlineIssueLabel: { richText: 'ISSUE 02', fontSize: 11, color: '#8b6b58' },
  onlineIssueTheme: { richText: '手指一根一根松开', fontSize: 11, color: '#8b6b58' },
  onlineQuestion: { richText: '事情过去以后，<br/>我们还在握紧什么？', fontSize: 20, color: '#5c493c' },
  offlineNumber: { richText: '02', fontSize: 11, color: '#8b6b58' },
  offlineContext: { richText: '线下 · 未来相见', fontSize: 11, color: '#8b6b58' },
  offlineTitle: { richText: '目前没有正在招募的线下活动。', fontSize: 19, color: '#5c493c' },
  offlineCopy: { richText: '时间、地点和带领者确认后，会在这里完整说明。', fontSize: 15, color: '#5c493c' },
  noticeLabel: { richText: '线下活动开放时会说明', fontSize: 11, color: '#8b6b58' },
  noticeCode: { richText: 'NOTICE', fontSize: 11, color: '#663124' },
  rule1Number: { richText: '01', fontSize: 11, color: '#8b6b58' }, rule1Title: { richText: '为什么相见', fontSize: 15, color: '#5c493c' }, rule1Copy: { richText: '这次实践回应什么真实需要', fontSize: 12, color: '#5c493c' },
  rule2Number: { richText: '02', fontSize: 11, color: '#8b6b58' }, rule2Title: { richText: '如何发生', fontSize: 15, color: '#5c493c' }, rule2Copy: { richText: '时间、地点与参与方式', fontSize: 12, color: '#5c493c' },
  rule3Number: { richText: '03', fontSize: 11, color: '#8b6b58' }, rule3Title: { richText: '谁来带领', fontSize: 15, color: '#5c493c' }, rule3Copy: { richText: '清楚说明经验与责任边界', fontSize: 12, color: '#5c493c' },
  rule4Number: { richText: '04', fontSize: 11, color: '#8b6b58' }, rule4Title: { richText: '如何退出', fontSize: 15, color: '#5c493c' }, rule4Copy: { richText: '任何人都可以保留或离开', fontSize: 12, color: '#5c493c' },
  nextAction: { richText: '留意下一次线下相见', fontSize: 15, color: '#5c493c' },
};

function sanitizeSharedPracticeCopy(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultSharedPracticeCopy).map(([key, fallback]) => {
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] as Record<string, unknown> : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 240, `共同实践${key}`);
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48 ? Number(item.fontSize) : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  }));
}


/** 单个富文本字段的取值类型。 */
type CopyItem = { richText: string; fontSize: number; color: string };

/**
 * 列表化字段：
 *   - paragraphs：正文段落，数量不限（原 paragraph1..paragraph3）
 *   - rules：线下说明条目，数量不限（原 rule1Number/Title/Copy .. rule4）
 * 旧数据在读取时自动转换为列表，无需回填。
 */
const SHARED_PARAGRAPH_LIMIT = 12;
const SHARED_RULE_LIMIT = 12;

function sanitizeCopyItem(raw: unknown, fallback: CopyItem, label: string): CopyItem {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, 240, label);
  const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48 ? Number(item.fontSize) : fallback.fontSize;
  const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
  return { richText, fontSize, color };
}

/** 把旧扁平结构里的段落 / 规则提取为列表；已是列表则直接沿用。 */
function normalizeSharedPracticeCopy(raw: unknown): Record<string, unknown> {
  const base = sanitizeSharedPracticeCopy(raw);
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};

  // 段落：优先读取列表，其次由 onlineCopy 单段转换
  const paragraphFallback: CopyItem = defaultSharedPracticeCopy.onlineCopy;
  const rawParagraphs = Array.isArray(source.onlineParagraphs) ? source.onlineParagraphs : null;
  const onlineParagraphs = rawParagraphs
    ? rawParagraphs.slice(0, SHARED_PARAGRAPH_LIMIT).map((item, index) => sanitizeCopyItem(item, paragraphFallback, `共同实践段落${index + 1}`))
    : [sanitizeCopyItem(source.onlineCopy, paragraphFallback, '共同实践讨论说明')];

  // 规则：优先读取列表，其次由 rule1..4 转换
  const ruleFallback: CopyItem = { richText: '', fontSize: 12, color: '#5c493c' };
  const rawRules = Array.isArray(source.rules) ? source.rules : null;
  const legacyRules = [1, 2, 3, 4].map((index) => ({
    number: sanitizeCopyItem(source[`rule${index}Number`], defaultSharedPracticeCopy[`rule${index}Number` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}序号`),
    title: sanitizeCopyItem(source[`rule${index}Title`], defaultSharedPracticeCopy[`rule${index}Title` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}标题`),
    copy: sanitizeCopyItem(source[`rule${index}Copy`], defaultSharedPracticeCopy[`rule${index}Copy` as keyof typeof defaultSharedPracticeCopy] as CopyItem, `共同实践规则${index}说明`),
  }));
  const rules = rawRules
    ? rawRules.slice(0, SHARED_RULE_LIMIT).map((item, index) => {
      const rule = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        number: sanitizeCopyItem(rule.number, legacyRules[index]?.number ?? { richText: String(index + 1).padStart(2, '0'), fontSize: 11, color: '#8b6b58' }, `共同实践规则${index + 1}序号`),
        title: sanitizeCopyItem(rule.title, ruleFallback, `共同实践规则${index + 1}标题`),
        copy: sanitizeCopyItem(rule.copy, ruleFallback, `共同实践规则${index + 1}说明`),
      };
    })
    : legacyRules;

  return { ...base, onlineParagraphs, rules };
}

const defaultPrivacyPageCopy = {
  topbarTitle: { richText: '通知与隐私', fontSize: 16, color: '#5c493c' },
  metaLeft: { richText: '我的', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'PRIVACY &amp; CHOICES', fontSize: 12, color: '#663124' },
  heroTitle: { richText: '方法应当由你使用，<br/>而不是反过来定义你。', fontSize: 28, color: '#5c493c' },
  heroIntro: { richText: '隐私与方法偏好始终由你决定。', fontSize: 16, color: '#5c493c' },
  privacyNumber: { richText: '01', fontSize: 11, color: '#8b6b58' },
  privacyLabel: { richText: '隐私', fontSize: 11, color: '#8b6b58' },
  privacyTitle: { richText: '观察记录默认私密', fontSize: 15, color: '#5c493c' },
  privacyCopy: { richText: '只保存在这台设备上，不自动公开或分享', fontSize: 12, color: '#5c493c' },
  privacyStatus: { richText: '已开启', fontSize: 12, color: '#663124' },
  methodNumber: { richText: '02', fontSize: 11, color: '#8b6b58' },
  methodLabel: { richText: '方法选择', fontSize: 11, color: '#8b6b58' },
  methodTitle: { richText: '暂不使用四时气韵', fontSize: 15, color: '#5c493c' },
  methodCopy: { richText: '你可以随时重新开启这一种观察方式', fontSize: 12, color: '#5c493c' },
  methodAction: { richText: '使用四时气韵', fontSize: 12, color: '#8b6b58' },
  reminderNumber: { richText: '03', fontSize: 11, color: '#8b6b58' },
  reminderLabel: { richText: '提醒与关于', fontSize: 11, color: '#8b6b58' },
  reminderTitle: { richText: '活动提醒', fontSize: 15, color: '#5c493c' },
  reminderCopy: { richText: '共同实践开放时再向你询问', fontSize: 12, color: '#5c493c' },
  reminderAction: { richText: '→', fontSize: 16, color: '#663124' },
  aboutTitle: { richText: '关于 MYRIAD SHE', fontSize: 15, color: '#5c493c' },
  aboutCopy: { richText: '品牌、内容来源与联系方式', fontSize: 12, color: '#5c493c' },
  aboutAction: { richText: '→', fontSize: 16, color: '#663124' },
  localLabel: { richText: '本地数据', fontSize: 11, color: '#8b6b58' },
  localTitle: { richText: '清除只影响这台设备，且无法恢复。', fontSize: 15, color: '#5c493c' },
    localCopy: { richText: '清除本机登录状态和临时数据；云端观察记录及账户数据将保留。', fontSize: 12, color: '#5c493c' },
    localAction: { richText: '清除本地登录状态', fontSize: 15, color: '#663124' },
    localConfirm: { richText: '确定清除这台设备上的登录状态和临时数据吗？云端记录不会删除。', fontSize: 12, color: '#5c493c' },
  footerCopy: { richText: '停用四时气韵不会自动删除历史记录。是否保留，由你决定。', fontSize: 12, color: '#5c493c' },
  policyTitle: { richText: '隐私政策', fontSize: 15, color: '#5c493c' },
  policyCopy: { richText: '了解我们如何处理信息', fontSize: 12, color: '#5c493c' },
};

function sanitizePrivacyPageCopy(raw: unknown) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultPrivacyPageCopy).map(([key, fallback]) => {
    const item = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])
      ? source[key] as Record<string, unknown>
      : {};
    const richText = sanitizeMinePageRichText(item.richText ?? fallback.richText, key === 'heroTitle' ? 160 : 320, `通知与隐私${key}`);
    const fontSize = Number.isSafeInteger(item.fontSize) && Number(item.fontSize) >= 10 && Number(item.fontSize) <= 48
      ? Number(item.fontSize)
      : fallback.fontSize;
    const color = typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color.toLowerCase() : fallback.color;
    return [key, { richText, fontSize, color }];
  }));
}

const lifeCardSuits = ['spade', 'heart', 'club', 'diamond'] as const;
const lifeCardRanks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const lifeCardTextLimits = { theme: 40, title: 60, summary: 600, prompt: 300, note: 400, sourceNote: 2000 };

interface LifeCardRow {
  month: number;
  day: number;
  suit: string;
  rank: string;
  theme: string;
  title: string;
  summary: string;
  prompt: string;
  note: string;
  sourceNote: string;
}

function toCsvCell(value: string) {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 解析 CSV（支持引号包裹、字段内换行与 "" 转义）。 */
function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ',') { row.push(cell); cell = ''; continue; }
    if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    if (char === '\r') continue;
    cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((entry) => entry.some((value) => value.trim() !== ''));
}

@Controller('content')
export class ContentController {
  private readonly homeCacheKey = 'myriad-she:content:home:v5';

  constructor(private readonly database: DatabaseService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly config: ConfigService, private readonly redis: RedisService, private readonly jwt: JwtService, @Optional() private readonly encryption?: DataEncryptionService) {}

  private async activeDiscussionRestrictionForRequest(request?: Request) {
    const header = request?.headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
    if (header.length > 7 + 16_384) return null;
    let payload: { sub?: string; role?: string; exp?: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; role?: string; exp?: number }>(header.slice(7));
    } catch {
      return null;
    }
    if (typeof payload.sub !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.sub)) return null;
    if (payload.role !== 'user' || !payload.exp || payload.exp * 1000 <= Date.now()) return null;
    return findActiveDiscussionRestriction(this.database, payload.sub);
  }

  private publicContentCacheTtlSeconds() {
    const configured = Number(this.config.get('CONTENT_PUBLIC_CACHE_TTL_SECONDS', 60));
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 600) : 60;
  }

  private boundedText(value: unknown, maximum: number, minimum = 0): value is string {
    return typeof value === 'string' && value.length >= minimum && value.length <= maximum;
  }

  /** 规范化微声音详情页的操作模块；未提供时保留 undefined，空数组表示明确不显示操作。 */
  private normalizeIssueAudioActions(value: unknown, owner = '微声音'): IssueAudioAction[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > maxIssueAudioActions) {
      throw new BadRequestException(`${owner}最多可添加 ${maxIssueAudioActions} 个操作模块`);
    }
    const ids = new Set<string>();
    return value.map((rawAction, index) => {
      const actionLabel = `${owner}的第 ${index + 1} 个操作模块`;
      if (!rawAction || typeof rawAction !== 'object' || Array.isArray(rawAction)) {
        throw new BadRequestException(`${actionLabel}格式无效`);
      }
      const action = rawAction as Record<string, unknown>;
      const unexpectedFields = Object.keys(action).filter((key) => !['id', 'label', 'labelRichText', 'kind', 'path', 'url'].includes(key));
      if (unexpectedFields.length) {
        throw new BadRequestException(`${actionLabel}包含未登记字段：${unexpectedFields.join('、')}`);
      }
      const id = typeof action.id === 'string' ? action.id.trim() : '';
      if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || ids.has(id)) {
        throw new BadRequestException(`${actionLabel}字段 id 无效或重复`);
      }
      ids.add(id);
      const labelRichText = action.labelRichText === undefined
        ? undefined
        : sanitizeRichText(action.labelRichText, 40, `${actionLabel}字段 labelRichText`, issueRichTextOptions);
      const label = labelRichText !== undefined
        ? plainTextFromRichText(labelRichText)
        : typeof action.label === 'string' ? action.label.trim() : '';
      if (!label || label.length > 40 || /[\r\n]/.test(label) || /<\/?[a-z][^>]*>/i.test(label)) {
        throw new BadRequestException(`${actionLabel}字段 label 须为 1–40 个字符的纯文本`);
      }
      const richLabelFields = labelRichText !== undefined ? { labelRichText } : {};
      if (action.kind !== 'page' && action.kind !== 'web' && action.kind !== 'share') {
        throw new BadRequestException(`${actionLabel}字段 kind 无效`);
      }
      if (action.path !== undefined && typeof action.path !== 'string') throw new BadRequestException(`${actionLabel}字段 path 须为字符串`);
      if (action.url !== undefined && typeof action.url !== 'string') throw new BadRequestException(`${actionLabel}字段 url 须为 HTTPS 地址`);
      const path = typeof action.path === 'string' ? action.path.trim() : '';
      const url = typeof action.url === 'string' ? action.url.trim() : '';
      if (action.kind === 'page') {
        if (url || !path || path.length > 512 || path.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(path)) {
          throw new BadRequestException(`${actionLabel}字段 path 须为有效的小程序页面路径`);
        }
        return { id, label, ...richLabelFields, kind: 'page', path };
      }
      if (action.kind === 'web') {
        if (path || !url || url.length > 2048 || !/^https:\/\/[^\s<>]+$/i.test(url)) {
          throw new BadRequestException(`${actionLabel}字段 url 须为 HTTPS 地址`);
        }
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('invalid protocol');
        } catch {
          throw new BadRequestException(`${actionLabel}字段 url 须为 HTTPS 地址`);
        }
        return { id, label, ...richLabelFields, kind: 'web', url };
      }
      if (path || url) throw new BadRequestException(`${actionLabel}为分享操作，不可包含 path 或 url`);
      return { id, label, ...richLabelFields, kind: 'share' };
    });
  }  private isValidIssueAudioActions(value: unknown): boolean {
    if (value === undefined) return true;
    if (!Array.isArray(value) || value.length > maxIssueAudioActions) return false;
    try {
      return this.normalizeIssueAudioActions(value) !== undefined;
    } catch {
      return false;
    }
  }

  private validateIssueDraft(value: unknown): IssueDraftContent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('字段 sections：期刊栏目内容格式无效');
    const sections = (value as Record<string, unknown>).sections;
    if (!Array.isArray(sections) || sections.length < 1 || sections.length > 40) throw new BadRequestException('字段 sections 须包含 1–40 个栏目');
    const ids = new Set<string>();
    const baseAllowedFields: Record<IssueModuleType, string[]> = {
      issueMeta: ['eyebrow', 'month', 'edition', 'introduction'], coverStory: ['imageObjectKey', 'altText', 'captionLeft', 'captionRight', 'eyebrow', 'title', 'titleFontSize', 'titleColor', 'body', 'bodyFontSize', 'bodyColor', 'byline'], cover: ['imageObjectKey', 'altText', 'captionLeft', 'captionRight'],
      opener: ['eyebrow', 'title', 'body'], story: ['eyebrow', 'title', 'body', 'imageObjectKey', 'altText', 'captionLeft', 'captionRight', 'detailCaptionLeft', 'detailCaptionRight', 'detailSource', 'detailParagraph1', 'detailParagraph2', 'detailQuote', 'officialArticleUrl'], storyAction: ['title', 'body', 'targetId'], image: ['imageObjectKey', 'altText', 'caption'],
      quote: ['text', 'attribution'], audio: ['title', 'duration', 'mediaType', 'audioObjectKey', 'videoObjectKey', 'detailTitle', 'description', 'transcript', 'quote', 'subtitle', 'tracks'], question: ['eyebrow', 'title', 'body'],
      observationAction: ['title', 'body'], sharedPracticeAction: ['title', 'body'],
      contents: ['title', 'entry1Label', 'entry1Summary', 'entry2Label', 'entry2Summary', 'entry3Label', 'entry3Summary', 'entry4Label', 'entry4Summary'],
      archive: ['title', 'entryLabel', 'entryTitle'], brandFooter: ['title', 'body'],
    };
    const normalized = sections.map((raw, index) => {
      const sectionLabel = `第 ${index + 1} 个栏目`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException(`${sectionLabel}格式无效`);
      const item = raw as Record<string, unknown>;
      const id = item.id;
      const type = item.type;
      const order = item.order;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(id) || ids.has(id)) throw new BadRequestException(`${sectionLabel}字段 id 无效或重复`);
      if (typeof type !== 'string' || !issueModuleTypes.includes(type as IssueModuleType)) throw new BadRequestException(`${sectionLabel}字段 type 不受支持`);
      const moduleType = type as IssueModuleType;
      const moduleLabel = `${sectionLabel}（类型：${type}，ID：${id}）`;
      if (!Number.isSafeInteger(order) || Number(order) < 0 || Number(order) >= sections.length) throw new BadRequestException(`${moduleLabel}字段 order 须为 0–${sections.length - 1} 的整数`);
      if (typeof item.enabled !== 'boolean') throw new BadRequestException(`${moduleLabel}字段 enabled 须为布尔值`);
      const legacyAudioActions = type === 'audio' ? item.actions : undefined;
      const baseFields = baseAllowedFields[moduleType];
      const richFields = issueRichTextFields[moduleType];
      const allowed = new Set([
        'id', 'type', 'order', 'enabled', 'linkType', 'linkPath', 'linkUrl', 'linkLabel', 'linkLabelRichText',
        ...(type === 'audio' ? ['actions'] : []), ...baseFields, ...withIssueRichTextFields(richFields),
      ]);
      const unexpectedFields = Object.keys(item).filter((key) => !allowed.has(key));
      if (unexpectedFields.length) throw new BadRequestException(`${moduleLabel}包含未登记字段：${unexpectedFields.join('、')}`);
      const normalizedLegacyActions = legacyAudioActions === undefined ? undefined : this.normalizeIssueAudioActions(legacyAudioActions, `${moduleLabel}字段 actions`);
      const linkType = item.linkType === undefined || item.linkType === '' ? 'none' : item.linkType;
      if (linkType !== 'none' && linkType !== 'page' && linkType !== 'web') throw new BadRequestException(`${moduleLabel}字段 linkType 无效`);
      const linkPath = typeof item.linkPath === 'string' ? item.linkPath.trim() : '';
      const linkUrl = typeof item.linkUrl === 'string' ? item.linkUrl.trim() : '';
      const linkLabelRichText = item.linkLabelRichText === undefined
        ? undefined
        : sanitizeRichText(item.linkLabelRichText, 40, `${moduleLabel}字段 linkLabelRichText`, issueRichTextOptions);
      const linkLabel = linkLabelRichText !== undefined
        ? plainTextFromRichText(linkLabelRichText)
        : (typeof item.linkLabel === 'string' ? item.linkLabel.trim() : '');
      if (linkType === 'page') {
        if (!linkPath || linkPath.length > 512 || linkPath.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(linkPath)) throw new BadRequestException(`${moduleLabel}字段 linkPath 须为有效的小程序页面路径`);
      }
      if (linkType === 'web') {
        if (!linkUrl || linkUrl.length > 2048 || !/^https:\/\/[^\s<>]+$/i.test(linkUrl)) throw new BadRequestException(`${moduleLabel}字段 linkUrl 须为 HTTPS 地址`);
        try {
          if (new URL(linkUrl).protocol !== 'https:') throw new Error('invalid protocol');
        } catch {
          throw new BadRequestException(`${moduleLabel}字段 linkUrl 须为 HTTPS 地址`);
        }
      }
      if (linkLabel !== '' && (linkLabel.length > 40 || /[\r\n]/.test(linkLabel) || /<\/?[a-z][^>]*>/i.test(linkLabel))) throw new BadRequestException(`${moduleLabel}字段 linkLabel 须为长度有效的纯文本`);
      const normalizedRichText: Record<string, string> = {};
      const normalizedRichPlainText: Record<string, string> = {};
      for (const richField of richFields) {
        const richKey = `${richField}RichText`;
        const richValue = item[richKey];
        if (richValue === undefined) continue;
        const sanitized = sanitizeRichText(richValue, issueRichTextMaximum(richField), `${moduleLabel}字段 ${richKey}`, issueRichTextOptions);
        normalizedRichText[richKey] = sanitized;
        normalizedRichPlainText[richField] = plainTextFromRichText(sanitized);
      }
      let normalizedTracks: IssueAudioTrack[] | undefined;
      for (const key of baseFields) {
        const field = item[key];
        if (key === 'tracks') {
          if (field === undefined) continue;
          if (type !== 'audio' || !Array.isArray(field) || field.length > maxIssueAudioTracks) throw new BadRequestException(`${moduleLabel}字段 tracks 最多可包含 ${maxIssueAudioTracks} 段微声音`);
          const trackIds = new Set<string>();
          normalizedTracks = field.map((rawTrack, trackIndex) => {
            const trackPosition = `${moduleLabel}字段 tracks 第 ${trackIndex + 1} 段微声音`;
            if (!rawTrack || typeof rawTrack !== 'object' || Array.isArray(rawTrack)) throw new BadRequestException(`${trackPosition}格式无效`);
            const track = rawTrack as Record<string, unknown>;
            const trackIdLabel = typeof track.id === 'string' && track.id ? `（ID：${track.id}）` : '';
            const trackLabel = `${trackPosition}${trackIdLabel}`;
            const trackFields = ['id', 'title', 'duration', 'mediaType', 'audioObjectKey', 'videoObjectKey', 'detailTitle', 'description', 'quote', 'subtitle', 'transcript', 'actions', ...withIssueRichTextFields([...issueAudioTrackRichTextFields])];
            const unexpectedTrackFields = Object.keys(track).filter((trackField) => !trackFields.includes(trackField));
            if (unexpectedTrackFields.length) throw new BadRequestException(`${trackLabel}包含未登记字段：${unexpectedTrackFields.join('、')}`);
            if (typeof track.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(track.id) || trackIds.has(track.id)) throw new BadRequestException(`${trackLabel}字段 id 无效或重复`);
            trackIds.add(track.id);
            const limits: Record<string, number> = { title: 120, detailTitle: 120, duration: 20, quote: 500, subtitle: 500, transcript: 6000, description: 6000 };
            const normalizedTrackRichText: Record<string, string> = {};
            for (const [trackField, maximum] of Object.entries(limits)) {
              const value = track[trackField] ?? '';
              if (typeof value !== 'string' || value.length > maximum || /<\/?[a-z][^>]*>/i.test(value)) throw new BadRequestException(`${trackLabel}字段 ${trackField} 须为不超过 ${maximum} 个字符的纯文本`);
              const richValue = track[`${trackField}RichText`];
              if (richValue === undefined) continue;
              const sanitized = sanitizeRichText(richValue, maximum, `${trackLabel}字段 ${trackField}RichText`, issueRichTextOptions);
              normalizedTrackRichText[`${trackField}RichText`] = sanitized;
              track[trackField] = plainTextFromRichText(sanitized);
            }
            const audioObjectKey = track.audioObjectKey ?? '';
            const videoObjectKey = track.videoObjectKey ?? '';
            if (audioObjectKey !== '' && (typeof audioObjectKey !== 'string' || !this.isManagedMediaObjectKey(audioObjectKey) || !audioObjectKey.startsWith('content/audio/'))) throw new BadRequestException(`${trackLabel}字段 audioObjectKey 须为 content/audio/ 下的受管媒体路径`);
            if (videoObjectKey !== '' && (typeof videoObjectKey !== 'string' || !this.isManagedMediaObjectKey(videoObjectKey) || !videoObjectKey.startsWith('content/video/'))) throw new BadRequestException(`${trackLabel}字段 videoObjectKey 须为 content/video/ 下的受管媒体路径`);
            if (track.mediaType !== undefined && track.mediaType !== 'audio' && track.mediaType !== 'video') throw new BadRequestException(`${trackLabel}字段 mediaType 须为 audio 或 video`);
            const mediaType = track.mediaType === 'video' || (!track.mediaType && videoObjectKey && !audioObjectKey) ? 'video' : 'audio';
            const actions = this.normalizeIssueAudioActions(track.actions, trackLabel);
            return {
              id: track.id, title: String(track.title ?? ''), duration: String(track.duration ?? ''), mediaType,
              audioObjectKey: String(audioObjectKey), videoObjectKey: String(videoObjectKey),
              detailTitle: String(track.detailTitle ?? ''), description: String(track.description ?? ''),
              quote: String(track.quote ?? ''), subtitle: String(track.subtitle ?? ''), transcript: String(track.transcript ?? ''),
              ...normalizedTrackRichText,
              ...(actions !== undefined ? { actions } : {}),
            };
          });
        } else if (key.endsWith('FontSize')) {
          if (field !== undefined && (!Number.isSafeInteger(field) || Number(field) < 20 || Number(field) > 120)) throw new BadRequestException(`${moduleLabel}字段 ${key} 须为 20–120 的整数`);
        } else if (key.endsWith('Color')) {
          if (field !== undefined && (typeof field !== 'string' || !/^#[0-9a-f]{6}$/i.test(field))) throw new BadRequestException(`${moduleLabel}字段 ${key} 须为 #RRGGBB 格式的颜色值`);
        } else if (key === 'targetId') {
          if (field !== undefined && (typeof field !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(field))) throw new BadRequestException(`${moduleLabel}字段 targetId 无效`);
        } else if (key === 'officialArticleUrl') {
          if (field !== undefined && field !== '') {
            let validArticleUrl = false;
            if (typeof field === 'string' && field.length <= 2048 && !/[\s<>]/.test(field)) {
              try {
                const articleUrl = new URL(field);
                validArticleUrl = articleUrl.protocol === 'https:' && articleUrl.hostname === 'mp.weixin.qq.com' && /^\/s(?:\/|$)/i.test(articleUrl.pathname);
              } catch {}
            }
            if (!validArticleUrl) throw new BadRequestException(`${moduleLabel}字段 officialArticleUrl 须为 mp.weixin.qq.com 的 HTTPS 文章链接`);
          }
        } else if (key === 'introduction') {
          if (field !== undefined && (typeof field !== 'string' || field.length > 120 || /[\r\n<>]/.test(field))) {
            throw new BadRequestException(`${moduleLabel}字段 introduction 须为不超过 120 字的单行纯文本`);
          }
        } else if (key === 'edition') {
          if (field !== undefined && (typeof field !== 'string' || field.length > 40 || /[\r\n<>]/.test(field))) {
            throw new BadRequestException(`${moduleLabel}字段 edition 须为不超过 40 字的单行纯文本`);
          }
        } else if (key.endsWith('ObjectKey')) {
          if (field !== undefined && field !== null && field !== '' && (typeof field !== 'string' || !this.isManagedMediaObjectKey(field)
            || (key === 'imageObjectKey' && !field.startsWith('content/image/'))
            || (key === 'audioObjectKey' && !field.startsWith('content/audio/'))
            || (key === 'videoObjectKey' && !field.startsWith('content/video/')))) throw new BadRequestException(`${moduleLabel}字段 ${key} 须为受管媒体路径`);
        } else if (field !== undefined && (typeof field !== 'string' || field.length > issueRichTextMaximum(key) || /<\/?[a-z][^>]*>/i.test(field))) {
          throw new BadRequestException(`${moduleLabel}字段 ${key} 须为长度有效且不含 HTML 的纯文本`);
        }
      }
      if (normalizedTracks?.[0] && normalizedTracks[0].actions === undefined && normalizedLegacyActions !== undefined) normalizedTracks[0].actions = normalizedLegacyActions;
      ids.add(id);
      const normalizedItem = { ...item, ...normalizedRichText, ...normalizedRichPlainText, id, type: moduleType, order: Number(order), enabled: item.enabled } as IssueModule;
      if (typeof normalizedItem.introduction === 'string') normalizedItem.introduction = normalizedItem.introduction.trim();
      if (typeof normalizedItem.edition === 'string') normalizedItem.edition = normalizedItem.edition.trim();
      delete normalizedItem.actions;
      delete normalizedItem.linkType;
      delete normalizedItem.linkPath;
      delete normalizedItem.linkUrl;
      delete normalizedItem.linkLabel;
      delete normalizedItem.linkLabelRichText;
      if (linkType === 'page') {
        normalizedItem.linkType = 'page';
        normalizedItem.linkPath = linkPath;
      } else if (linkType === 'web') {
        normalizedItem.linkType = 'web';
        normalizedItem.linkUrl = linkUrl;
      }
      if (linkType !== 'none' && linkLabel) normalizedItem.linkLabel = linkLabel;
      if (linkType !== 'none' && linkLabelRichText !== undefined) normalizedItem.linkLabelRichText = linkLabelRichText;
      if (normalizedTracks) {
        normalizedItem.tracks = normalizedTracks;
        const firstTrack = normalizedTracks[0];
        if (firstTrack) Object.assign(normalizedItem, firstTrack);
        delete normalizedItem.actions;
      }
      return normalizedItem;
    });
    const orderCounts = new Map<number, number>();
    for (const item of normalized) orderCounts.set(item.order, (orderCounts.get(item.order) ?? 0) + 1);
    const duplicateOrders = [...orderCounts.entries()].filter(([, count]) => count > 1).map(([order]) => order);
    if (duplicateOrders.length) throw new BadRequestException(`字段 order 存在重复值：${duplicateOrders.join('、')}`);
    const sectionIds = new Set(normalized.map((item) => item.id));
    for (const [index, module] of normalized.entries()) {
      if (module.type === 'storyAction' && module.targetId !== undefined && !sectionIds.has(String(module.targetId))) {
        throw new BadRequestException(`第 ${index + 1} 个栏目（类型：${module.type}，ID：${module.id}）字段 targetId 指向的栏目不存在：${String(module.targetId)}`);
      }
    }
    const discussion = (value as Record<string, unknown>).discussion;
    return { sections: normalized.sort((left, right) => left.order - right.order), discussion: discussion === undefined ? defaultDiscussionContent() : validateDiscussionContent(discussion) };
  }

  private legacyIssueDraft(issue: IssueDto | UpdateIssueDto): IssueDraftContent {
    const source = issue as IssueDto;
    return this.validateIssueDraft({ sections: [
      { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: source.label ?? '本期策展', eyebrowRichText: source.labelRichText ?? '', month: source.month ?? '', monthRichText: source.monthRichText ?? '' },
      { id: 'cover', type: 'cover', order: 1, enabled: true, imageObjectKey: source.coverObjectKey ?? null, altText: source.theme ?? '', captionLeft: source.homeCoverCaptionLeft ?? '人物纪实·时雨', captionLeftRichText: source.homeCoverCaptionLeftRichText ?? '', captionRight: source.homeCoverCaptionRight ?? '本期封面', captionRightRichText: source.homeCoverCaptionRightRichText ?? '' },
      { id: 'opener', type: 'opener', order: 2, enabled: true, eyebrow: '本期主题', title: source.theme ?? '', titleRichText: source.themeRichText ?? '', body: plainTextFromRichText(source.homeMetaRichText ?? ''), bodyRichText: source.homeMetaRichText ?? '' },
      { id: 'audio', type: 'audio', order: 3, enabled: Boolean(source.microVoiceObjectKey), title: source.microVoiceTitle ?? '', duration: source.microVoiceDuration ?? '', audioObjectKey: source.microVoiceObjectKey ?? null, quote: '', subtitle: '', transcript: '' },
      { id: 'question', type: 'question', order: 4, enabled: true, eyebrow: '从她的经验，回到你的此刻', title: source.question ?? '', titleRichText: source.questionRichText ?? '', body: '' },
      { id: 'observation-action', type: 'observationAction', order: 5, enabled: true, title: '留给自己观察', body: '从现实处境开始，记录保持私密' },
      { id: 'story', type: 'story', order: 6, enabled: false, eyebrow: '人物纪实', title: '', body: '', imageObjectKey: '', altText: '', captionLeft: '', captionRight: '' },
      { id: 'story-action', type: 'storyAction', order: 7, enabled: false, title: '进入本期人物', body: '', targetId: 'story' },
      { id: 'contents', type: 'contents', order: 8, enabled: true, title: '本期目录', entry1Label: '人物纪实', entry1Summary: source.theme ?? '', entry2Label: '微声音', entry2Summary: '第一个普通早晨', entry3Label: '此刻观察', entry3Summary: '从本期问题继续', entry4Label: '本期讨论', entry4Summary: '一起听见不同的经历' },
      { id: 'archive', type: 'archive', order: 9, enabled: true, title: '策展档案', entryLabel: 'ISSUE 01 · 往期精彩示意', entryTitle: '留住没有答案的时刻' },
      { id: 'brand-footer', type: 'brandFooter', order: 10, enabled: true, title: '我有我的时节', body: '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' },
    ] });
  }

  private isOptionalRichText(value: unknown) {
    return value === undefined || this.boundedText(value, issueRichTextOptions.maxHtmlCharacters);
  }

  private isPublicHomeCache(value: unknown): value is PublicHomeCache {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const root = value as Record<string, unknown>;
    const issue = root.issue;
    const issueRecord = typeof issue === 'object' && issue !== null && !Array.isArray(issue)
      ? issue as Record<string, unknown>
      : null;
    const validIssue = issue === null || (issueRecord !== null
      && this.boundedText(issueRecord.code, 64, 2)
      && this.boundedText(issueRecord.label, 80, 2)
      && this.boundedText(issueRecord.month, 40, 2)
      && this.boundedText(issueRecord.theme, 200, 2)
      && this.boundedText(issueRecord.question, 500, 2)
      && (issueRecord.microVoiceTitle === null || this.boundedText(issueRecord.microVoiceTitle, 120))
      && (issueRecord.microVoiceDuration === null || this.boundedText(issueRecord.microVoiceDuration, 20))
      && this.boundedText(issueRecord.labelRichText, 24000)
      && this.boundedText(issueRecord.monthRichText, 24000)
      && this.boundedText(issueRecord.themeRichText, 24000)
      && this.boundedText(issueRecord.questionRichText, 24000)
      && this.boundedText(issueRecord.homeMetaRichText, 24000)
      && Number.isSafeInteger(issueRecord.homeMetaFontSize) && Number(issueRecord.homeMetaFontSize) >= 12 && Number(issueRecord.homeMetaFontSize) <= 48
      && typeof issueRecord.homeMetaColor === 'string' && /^#[0-9a-f]{6}$/i.test(issueRecord.homeMetaColor)
      && this.boundedText(issueRecord.homeCoverCaptionLeft, 80)
      && this.boundedText(issueRecord.homeCoverCaptionLeftRichText, 24000)
      && this.boundedText(issueRecord.homeCoverCaptionRight, 80)
      && this.boundedText(issueRecord.homeCoverCaptionRightRichText, 24000)
      && (issueRecord.coverObjectKey === null
        || (typeof issueRecord.coverObjectKey === 'string'
          && this.isManagedMediaObjectKey(issueRecord.coverObjectKey)
          && issueRecord.coverObjectKey.startsWith('content/image/')))
      && (issueRecord.microVoiceObjectKey === null
        || (typeof issueRecord.microVoiceObjectKey === 'string'
          && this.isManagedMediaObjectKey(issueRecord.microVoiceObjectKey)
          && issueRecord.microVoiceObjectKey.startsWith('content/audio/')))
      && (issueRecord.homeBackgroundObjectKey == null
        || (typeof issueRecord.homeBackgroundObjectKey === 'string'
          && this.isManagedMediaObjectKey(issueRecord.homeBackgroundObjectKey)
          && issueRecord.homeBackgroundObjectKey.startsWith('content/image/'))));
    const validModules = root.modules === undefined || (Array.isArray(root.modules) && root.modules.length <= 40 && root.modules.every((module) => {
      if (!module || typeof module !== 'object' || Array.isArray(module)) return false;
      const record = module as Record<string, unknown>;
      if (typeof record.id !== 'string' || typeof record.type !== 'string' || !Number.isSafeInteger(record.order) || typeof record.enabled !== 'boolean') return false;
      if (record.introduction !== undefined && (!this.boundedText(record.introduction, 120) || /[\r\n<>]/.test(String(record.introduction)))) return false;
      if (record.edition !== undefined && (!this.boundedText(record.edition, 40) || /[\r\n<>]/.test(String(record.edition)))) return false;
      if (record.linkType !== undefined) {
        if (record.linkType === 'page') {
          if (!this.boundedText(record.linkPath, 512, 1) || String(record.linkPath).includes('..')
            || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(String(record.linkPath))) return false;
        } else if (record.linkType === 'web') {
          if (!this.boundedText(record.linkUrl, 2048, 8) || !/^https:\/\/[^\s<>]+$/i.test(String(record.linkUrl))) return false;
        } else if (record.linkType !== 'none') return false;
        if (record.linkLabel !== undefined && (!this.boundedText(record.linkLabel, 40, 1) || /[\r\n]/.test(String(record.linkLabel)))) return false;
        if (!this.isOptionalRichText(record.linkLabelRichText)) return false;
      }
      if (issueModuleTypes.includes(record.type as IssueModuleType)) {
        const richFields = issueRichTextFields[record.type as IssueModuleType];
        if (!richFields.every((field) => this.isOptionalRichText(record[`${field}RichText`]))) return false;
      }
      if (record.tracks === undefined) return true;
      return record.type === 'audio' && Array.isArray(record.tracks) && record.tracks.length <= maxIssueAudioTracks && record.tracks.every((track) => {
        if (!track || typeof track !== 'object' || Array.isArray(track)) return false;
        const audioTrack = track as Record<string, unknown>;
        const mediaType = audioTrack.mediaType === 'video' ? 'video' : 'audio';
        const objectKey = mediaType === 'video' ? audioTrack.videoObjectKey : audioTrack.audioObjectKey;
        return typeof audioTrack.id === 'string' && /^[a-z0-9][a-z0-9-]{1,63}$/.test(audioTrack.id)
          && typeof objectKey === 'string' && this.isManagedMediaObjectKey(objectKey)
          && objectKey.startsWith(mediaType === 'video' ? 'content/video/' : 'content/audio/')
          && issueAudioTrackRichTextFields.every((field) => this.isOptionalRichText(audioTrack[`${field}RichText`]))
          && this.isValidIssueAudioActions(audioTrack.actions);
      });
    }));
    return this.boundedText(root.question, 500)
      && Array.isArray(root.sections) && root.sections.length <= 16 && root.sections.every((section) => this.boundedText(section, 80, 1))
      && (root.publishedVersion === undefined || (Number.isSafeInteger(root.publishedVersion) && Number(root.publishedVersion) >= 0))
      && validModules
      && validIssue;
  }

  private async materializePublicHome(cache: PublicHomeCache): Promise<PublicHomeResponse> {
    const [cover, voice, background] = await Promise.all([
      this.createDownloadUrlIfAvailable(cache.issue?.coverObjectKey ?? undefined),
      this.createDownloadUrlIfAvailable(cache.issue?.microVoiceObjectKey ?? undefined),
      this.createDownloadUrlIfAvailable(cache.issue?.homeBackgroundObjectKey ?? undefined),
    ]);
    const modules = await Promise.all((cache.modules ?? []).filter((item) => item.enabled).map(async (module) => {
      const publicModule = { ...module };
      const imageKey = typeof module.imageObjectKey === 'string' ? module.imageObjectKey : undefined;
      const audioKey = typeof module.audioObjectKey === 'string' ? module.audioObjectKey : undefined;
      const videoKey = typeof module.videoObjectKey === 'string' ? module.videoObjectKey : undefined;
      delete publicModule.imageObjectKey;
      delete publicModule.audioObjectKey;
      delete publicModule.videoObjectKey;
      if (imageKey) publicModule.imageUrl = (await this.createDownloadUrlIfAvailable(imageKey))?.url ?? '';
      if (audioKey) publicModule.audioUrl = (await this.createDownloadUrlIfAvailable(audioKey))?.url ?? '';
      if (videoKey) publicModule.videoUrl = (await this.createDownloadUrlIfAvailable(videoKey))?.url ?? '';
      if (Array.isArray(module.tracks)) {
        publicModule.tracks = await Promise.all((module.tracks as Array<Record<string, unknown>>).map(async (track) => {
          const publicTrack = { ...track };
          const mediaType = track.mediaType === 'video' ? 'video' : 'audio';
          const trackAudioKey = typeof track.audioObjectKey === 'string' ? track.audioObjectKey : undefined;
          const trackVideoKey = typeof track.videoObjectKey === 'string' ? track.videoObjectKey : undefined;
          delete publicTrack.audioObjectKey;
          delete publicTrack.videoObjectKey;
          publicTrack.mediaType = mediaType;
          publicTrack.audioUrl = trackAudioKey ? (await this.createDownloadUrlIfAvailable(trackAudioKey))?.url ?? '' : '';
          publicTrack.videoUrl = trackVideoKey ? (await this.createDownloadUrlIfAvailable(trackVideoKey))?.url ?? '' : '';
          publicTrack.detailTitle = typeof track.detailTitle === 'string' ? track.detailTitle : '';
          publicTrack.description = typeof track.description === 'string' ? track.description : '';
          return publicTrack;
        }));
      }
      return publicModule;
    }));
    return {
      issue: cache.issue ? {
        code: cache.issue.code,
        label: cache.issue.label,
        labelRichText: cache.issue.labelRichText ?? '',
        month: cache.issue.month,
        monthRichText: cache.issue.monthRichText ?? '',
        theme: cache.issue.theme,
        themeRichText: cache.issue.themeRichText ?? '',
        question: cache.issue.question,
        questionRichText: cache.issue.questionRichText ?? '',
        microVoiceTitle: cache.issue.microVoiceTitle,
        microVoiceDuration: cache.issue.microVoiceDuration,
        homeMetaRichText: cache.issue.homeMetaRichText,
        homeMetaFontSize: cache.issue.homeMetaFontSize,
        homeMetaColor: cache.issue.homeMetaColor,
        homeCoverCaptionLeft: cache.issue.homeCoverCaptionLeft,
        homeCoverCaptionLeftRichText: cache.issue.homeCoverCaptionLeftRichText ?? '',
        homeCoverCaptionRight: cache.issue.homeCoverCaptionRight,
        homeCoverCaptionRightRichText: cache.issue.homeCoverCaptionRightRichText ?? '',
        homeBackgroundUrl: background?.url ?? '',
      } : null,
      question: cache.question,
      coverUrl: cover?.url ?? '',
      microVoice: {
        title: cache.issue?.microVoiceTitle ?? '',
        duration: cache.issue?.microVoiceDuration ?? '',
        url: voice?.url ?? '',
        enabled: Boolean(voice),
      },
      sections: cache.sections,
      publishedVersion: cache.publishedVersion ?? 0,
      modules,
    };
  }

  private invalidateHomeCache() {
    return this.redis.delete(this.homeCacheKey);
  }

  private homeCacheUnavailable() {
    return new ServiceUnavailableException({
      code: 'content_home_cache_unavailable',
      message: '公开内容缓存暂时无法失效，请稍后重试',
    });
  }

  private orphanMediaGraceHours() {
    const configured = Number(this.config.get('CONTENT_MEDIA_ORPHAN_GRACE_HOURS', 24));
    return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 720) : 24;
  }

  private isUniqueViolation(error: unknown) {
    return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
  }

  private uniqueConstraint(error: unknown) {
    return error && typeof error === 'object' && typeof (error as { constraint?: unknown }).constraint === 'string'
      ? (error as { constraint: string }).constraint
      : '';
  }

  private requiredText(value: string, field: string, minimum: number, maximum: number) {
    const normalized = value.trim();
    if (normalized.length < minimum || normalized.length > maximum) {
      throw new BadRequestException(`${field}长度无效`);
    }
    return normalized;
  }

  private optionalText(value: string | null | undefined, field: string, maximum: number) {
    if (value === null || value === undefined) return value;
    const normalized = value.trim();
    if (normalized.length > maximum) throw new BadRequestException(`${field}长度无效`);
    return normalized || null;
  }

  private safeHomeMetaRichText(value: string | undefined) {
    if (value === undefined) return undefined;
    return sanitizeRichText(value, 24000, '首页期刊信息富文本', issueRichTextOptions);
  }

  private normalizeIssueInput(body: IssueDto | UpdateIssueDto, requireCoreFields: boolean) {
    const normalized = { ...body } as IssueDto & UpdateIssueDto;
    const richCoreFields = [
      ['labelRichText', 'label', '期刊标签富文本', 80],
      ['monthRichText', 'month', '期刊月份富文本', 40],
      ['themeRichText', 'theme', '期刊主题富文本', 200],
      ['questionRichText', 'question', '本期问题富文本', 500],
    ] as const;
    for (const [richKey, plainKey, label, maximum] of richCoreFields) {
      const value = normalized[richKey];
      if (value === undefined) continue;
      const richText = sanitizeRichText(value, maximum, label, issueRichTextOptions);
      normalized[richKey] = richText as never;
      normalized[plainKey] = plainTextFromRichText(richText) as never;
    }
    const coreFields = [
      ['code', '期刊编号', 2, 64],
      ['label', '期刊标签', 2, 80],
      ['month', '期刊月份', 2, 40],
      ['theme', '期刊主题', 2, 200],
      ['question', '本期问题', 2, 500],
    ] as const;
    for (const [key, label, minimum, maximum] of coreFields) {
      const value = normalized[key];
      if (value === undefined) {
        if (requireCoreFields) throw new BadRequestException(`${label}不能为空`);
        continue;
      }
      normalized[key] = this.requiredText(value, label, minimum, maximum) as never;
    }
    normalized.microVoiceTitle = this.optionalText(normalized.microVoiceTitle, '微声音标题', 120) as never;
    normalized.microVoiceDuration = this.optionalText(normalized.microVoiceDuration, '微声音时长', 20) as never;
    normalized.coverObjectKey = this.optionalText(normalized.coverObjectKey, '封面媒体路径', 512) as never;
    normalized.microVoiceObjectKey = this.optionalText(normalized.microVoiceObjectKey, '音频媒体路径', 512) as never;
    normalized.homeBackgroundObjectKey = this.optionalText(normalized.homeBackgroundObjectKey, '首页底图路径', 512) as never;
    normalized.homeMetaRichText = this.safeHomeMetaRichText(normalized.homeMetaRichText) as never;
    const richCaptionFields = [
      ['homeCoverCaptionLeftRichText', 'homeCoverCaptionLeft', '封面左侧说明富文本'],
      ['homeCoverCaptionRightRichText', 'homeCoverCaptionRight', '封面右侧说明富文本'],
    ] as const;
    for (const [richKey, plainKey, label] of richCaptionFields) {
      const value = normalized[richKey];
      if (value === undefined) continue;
      const richText = sanitizeRichText(value, 80, label, issueRichTextOptions);
      normalized[richKey] = richText as never;
      normalized[plainKey] = plainTextFromRichText(richText) as never;
    }
    const coverCaptionDefaults = { homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面' };
    for (const key of ['homeCoverCaptionLeft', 'homeCoverCaptionRight'] as const) {
      const value = normalized[key];
      if (value === undefined) {
        if (requireCoreFields) normalized[key] = coverCaptionDefaults[key] as never;
        continue;
      }
      const caption = value.trim();
      if (caption.length > 80 || /[\r\n]/.test(caption)) throw new BadRequestException('封面说明文字须为 80 字以内的单行文本');
      normalized[key] = caption as never;
    }
    if (normalized.homeMetaFontSize !== undefined && (!Number.isInteger(normalized.homeMetaFontSize) || normalized.homeMetaFontSize < 12 || normalized.homeMetaFontSize > 48)) {
      throw new BadRequestException('首页期刊信息字号须为 12–48px');
    }
    if (normalized.homeMetaColor !== undefined && !/^#[0-9a-f]{6}$/i.test(normalized.homeMetaColor)) {
      throw new BadRequestException('首页期刊信息颜色格式无效');
    }
    normalized.homeMetaColor = normalized.homeMetaColor?.toLowerCase() as never;
    return normalized;
  }

  private contentConflict(error: unknown) {
    if (!this.isUniqueViolation(error)) return error;
    const constraint = this.uniqueConstraint(error);
    if (constraint === 'content_issues_code_key') {
      return new ConflictException({ code: 'content_issue_code_exists', message: '期刊编号已存在，请修改编号后重试' });
    }
    if (constraint === 'content_issues_single_published_idx') {
      return new ConflictException({ code: 'content_issue_publish_conflict', message: '发布状态发生并发变化，请刷新期刊后重试' });
    }
    return new ConflictException({ code: 'content_issue_conflict', message: '期刊保存发生并发冲突，请刷新后重试' });
  }

  private async validateMediaKeys(input: { coverObjectKey?: string; microVoiceObjectKey?: string; videoObjectKey?: string; homeBackgroundObjectKey?: string }) {
    if (input.coverObjectKey && (!this.isManagedMediaObjectKey(input.coverObjectKey) || !input.coverObjectKey.startsWith('content/image/'))) throw new BadRequestException('封面媒体路径无效');
    if (input.microVoiceObjectKey && (!this.isManagedMediaObjectKey(input.microVoiceObjectKey) || !input.microVoiceObjectKey.startsWith('content/audio/'))) throw new BadRequestException('音频媒体路径无效');
    if (input.videoObjectKey && (!this.isManagedMediaObjectKey(input.videoObjectKey) || !input.videoObjectKey.startsWith('content/video/'))) throw new BadRequestException('视频媒体路径无效');
    if (input.homeBackgroundObjectKey && (!this.isManagedMediaObjectKey(input.homeBackgroundObjectKey) || !input.homeBackgroundObjectKey.startsWith('content/image/'))) throw new BadRequestException('首页底图路径无效');
    const mediaKeys = [input.coverObjectKey, input.microVoiceObjectKey, input.videoObjectKey, input.homeBackgroundObjectKey].filter((key): key is string => Boolean(key));
    const metadata = await Promise.all(mediaKeys.map((key) => this.storage.objectMetadata(key)));
    if (metadata.some((value) => !value?.contentType)) throw new BadRequestException('期刊引用的媒体对象不存在');
    if (metadata.some((value) => typeof value?.contentLength !== 'number' || value.contentLength <= 0)) throw new BadRequestException('无法读取有效的期刊媒体大小');
    const maxBytes = this.storage.maxUploadBytes();
    if (metadata.some((value) => typeof value?.contentLength === 'number' && value.contentLength > maxBytes)) {
      throw new BadRequestException(`媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    }
    const invalidType = mediaKeys.some((key, index) => key.startsWith('content/image/')
      ? !allowedImageTypes.includes(metadata[index]?.contentType || '')
      : key.startsWith('content/video/')
        ? !allowedVideoTypes.includes(metadata[index]?.contentType || '')
        : !allowedAudioTypes.includes(metadata[index]?.contentType || ''));
    if (invalidType) throw new BadRequestException('期刊媒体类型与对象路径不匹配');
  }

  private async createDownloadUrlIfAvailable(objectKey?: string) {
    if (!objectKey) return null;
    const metadata = await this.storage.objectMetadata(objectKey);
    if (!this.isAllowedMediaObject(objectKey, metadata)) return null;
    return this.storage.createDownloadUrl(objectKey);
  }

  private isAllowedMediaObject(
    objectKey: string,
    metadata: { contentType: string | null; contentLength: number | null } | null,
  ) {
    if (!this.isManagedMediaObjectKey(objectKey)) return false;
    if (!metadata?.contentType || typeof metadata.contentLength !== 'number' || metadata.contentLength <= 0 || metadata.contentLength > this.storage.maxUploadBytes()) return false;
    if (objectKey.startsWith('content/image/')) return allowedImageTypes.includes(metadata.contentType);
    if (objectKey.startsWith('content/audio/')) return allowedAudioTypes.includes(metadata.contentType);
    if (objectKey.startsWith('content/video/')) return allowedVideoTypes.includes(metadata.contentType);
    return false;
  }

  private isManagedMediaObjectKey(objectKey: string) {
    const prefixes = ['content/image/', 'content/audio/', 'content/video/'];
    const prefix = prefixes.find((candidate) => objectKey.startsWith(candidate));
    const segments = objectKey.split('/');
    return Boolean(prefix)
      && objectKey.length <= 512
      && !/[\\\s\u0000-\u001F\u007F?#]/.test(objectKey)
      && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
      && objectKey.length > (prefix?.length ?? 0);
  }

  private async archiveOtherPublishedIssues(client: PoolClient, actorId: string, exceptId?: string) {
    const values = exceptId ? [exceptId] : [];
    const result = await client.query<{ id: string }>(
      `update content_issues set status = 'archived', edit_version = edit_version + 1, updated_at = now()
       where status = 'published' ${exceptId ? 'and id <> $1' : ''}
       returning id`, values,
    );
    for (const issue of result.rows) {
      await this.audit.record({
        actorType: 'admin',
        actorId,
        action: 'content.issue.auto_archived',
        resourceType: 'content_issue',
        resourceId: issue.id,
        metadata: { reason: 'single_published_issue' },
      }, client);
    }
  }

  @Post('media/upload-url')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async mediaUploadUrl(@Req() request: Request & { user?: { sub: string } }, @Body() body: MediaUploadDto) {
    const allowed = body.kind === 'image' ? allowedImageTypes : body.kind === 'video' ? allowedVideoTypes : allowedAudioTypes;
    if (!allowed.includes(body.contentType)) throw new BadRequestException('不支持的媒体类型');
    const maxBytes = Math.max(1, Math.floor(Number(this.storage.maxUploadBytes())));
    if (body.fileSize > maxBytes) throw new BadRequestException(`媒体文件不能超过 ${Math.floor(maxBytes / 1024 / 1024)} MB`);
    const adminId = request.user?.sub;
    if (!adminId) throw new ForbiddenException('无法确认当前管理员身份');
    const target = await this.storage.createUploadUrl(body.fileName, body.contentType, body.kind, body.fileSize);
    const cleanupToken = await this.jwt.signAsync({ sub: adminId, scope: 'content_media_cleanup', objectKey: target.objectKey }, { expiresIn: 24 * 60 * 60 });
    return { ...target, cleanupToken };
  }

  @Delete('media')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async deleteUnusedMedia(@Req() request: Request & { user?: { sub: string } }, @Body() body: MediaDeleteDto) {
    if (!this.isManagedMediaObjectKey(body.objectKey)) throw new BadRequestException('无效的媒体对象');
    if (body.objectKey.startsWith('content/audio/') || body.objectKey.startsWith('content/video/')) {
      throw new ConflictException({ code: 'media_retained', message: '已上传的音频或视频按保留策略存档，不支持回收' });
    }
    if (body.purpose === 'temporary') {
      let claims: { sub?: string; scope?: string; objectKey?: string };
      try {
        if (!body.cleanupToken) throw new Error('missing_cleanup_token');
        claims = await this.jwt.verifyAsync(body.cleanupToken);
      } catch {
        throw new ForbiddenException({ code: 'media_cleanup_token_invalid', message: '临时媒体清理凭证无效或已过期' });
      }
      if (claims.scope !== 'content_media_cleanup' || claims.sub !== request.user?.sub || claims.objectKey !== body.objectKey) {
        throw new ForbiddenException({ code: 'media_cleanup_token_invalid', message: '临时媒体清理凭证与当前对象或管理员不匹配' });
      }
    }
    return this.database.withSessionAdvisoryLock('myriad-she-content-media', async (client) => {
      if (body.purpose === 'orphan') {
        const metadata = await this.storage.objectMetadata(body.objectKey);
        if (!metadata) throw new NotFoundException('媒体对象不存在');
        const modifiedAt = metadata.lastModified;
        const cutoff = Date.now() - this.orphanMediaGraceHours() * 60 * 60 * 1000;
        if (!(modifiedAt instanceof Date) || Number.isNaN(modifiedAt.getTime()) || modifiedAt.getTime() > cutoff) {
          throw new ConflictException({ code: 'media_protected', message: '媒体对象仍在保护期内或修改时间不可确认' });
        }
      }

      await this.database.withClientTransaction(client, async (transaction) => {
        const references = await transaction.query(
          `select exists (
             select 1 from content_issues
             where cover_object_key = $1 or micro_voice_object_key = $1 or home_background_object_key = $1
           ) or exists (
             select 1 from content_issues issue,
               jsonb_array_elements(coalesce(issue.draft_content->'sections', '[]'::jsonb)) module
             where module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1
                or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1)
           ) or exists (
             select 1 from content_issue_publications publication,
               jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
             where module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1
                or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1)
           ) or exists (
             select 1 from content_issue_publications publication
             where publication.snapshot->'issue'->>'homeBackgroundObjectKey' = $1
           ) or exists (
             select 1 from content_daily_objects daily,
               jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
             where daily.content->>'articleImage' = $1 or product->>'image' = $1
           ) or exists (
             select 1 from admin_content_drafts draft,
               jsonb_array_elements(coalesce(draft.content->'products', '[]'::jsonb)) product
             where draft.content_key = 'daily-objects'
               and (draft.content->>'articleImage' = $1 or product->>'image' = $1)
           ) as referenced`, [body.objectKey],
        );
        if (references.rows[0]?.referenced) {
          throw new ConflictException({ code: 'media_referenced', message: '该媒体仍被期刊引用' });
        }
        await this.audit.record({
          actorType: 'admin',
          actorId: request.user?.sub,
          action: 'content.media.deletion_requested',
          resourceType: 'content_media',
          resourceId: body.objectKey,
          metadata: { purpose: body.purpose },
        }, transaction);
      });

      try {
        await this.storage.deleteObject(body.objectKey);
      } catch (error) {
        try {
          await this.database.withClientTransaction(client, (transaction) => this.audit.record({
            actorType: 'admin',
            actorId: request.user?.sub,
            action: 'content.media.deletion_failed',
            resourceType: 'content_media',
            resourceId: body.objectKey,
            metadata: { purpose: body.purpose, stage: 'object_delete' },
          }, transaction));
        } catch {
          // The committed deletion intent remains available if failure auditing is unavailable.
        }
        throw error;
      }

      let auditRecorded = true;
      try {
        await this.database.withClientTransaction(client, (transaction) => this.audit.record({
          actorType: 'admin',
          actorId: request.user?.sub,
          action: 'content.media.deleted',
          resourceType: 'content_media',
          resourceId: body.objectKey,
          metadata: { purpose: body.purpose },
        }, transaction));
      } catch {
        auditRecorded = false;
      }
      return { deleted: true, auditIntentRecorded: true, auditRecorded };
    });
  }

  @Get('media/orphans')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listOrphanMedia(@Query('limit') limitValue?: string, @Query('continuationToken') continuationToken?: string) {
    const { limit } = parsePagination(limitValue, undefined, { defaultLimit: 50, maxLimit: 100, label: '媒体分页' });
    const normalizedContinuationToken = continuationToken?.trim() || undefined;
    if (normalizedContinuationToken && normalizedContinuationToken.length > 2048) throw new BadRequestException('媒体分页标记无效');
    const graceHours = this.orphanMediaGraceHours();
    const page = await this.storage.listObjects('content/', limit, normalizedContinuationToken);
    const cutoff = Date.now() - graceHours * 60 * 60 * 1000;
    const candidates = page.items.filter((item) => item.objectKey.startsWith('content/image/')
      && this.isManagedMediaObjectKey(item.objectKey)
      && item.lastModified && item.lastModified.getTime() <= cutoff);
    const keys = candidates.map((item) => item.objectKey);
    const referenced = keys.length
      ? await this.database.query<{ objectKey: string }>(
        `select listed.object_key as "objectKey"
         from unnest($1::text[]) as listed(object_key)
         where exists (
           select 1 from content_issues
           where cover_object_key = listed.object_key or micro_voice_object_key = listed.object_key or home_background_object_key = listed.object_key
         ) or exists (
           select 1 from content_issues issue,
             jsonb_array_elements(coalesce(issue.draft_content->'sections', '[]'::jsonb)) module
           where module->>'imageObjectKey' = listed.object_key or module->>'audioObjectKey' = listed.object_key
              or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = listed.object_key)
         ) or exists (
           select 1 from content_issue_publications publication,
             jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
           where module->>'imageObjectKey' = listed.object_key or module->>'audioObjectKey' = listed.object_key
              or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = listed.object_key)
         ) or exists (
           select 1 from content_issue_publications publication
           where publication.snapshot->'issue'->>'homeBackgroundObjectKey' = listed.object_key
         ) or exists (
           select 1 from content_daily_objects daily,
             jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
           where daily.content->>'articleImage' = listed.object_key or product->>'image' = listed.object_key
         ) or exists (
           select 1 from admin_content_drafts draft,
             jsonb_array_elements(coalesce(draft.content->'products', '[]'::jsonb)) product
           where draft.content_key = 'daily-objects'
             and (draft.content->>'articleImage' = listed.object_key or product->>'image' = listed.object_key)
         )`, [keys],
      )
      : { rows: [] as Array<{ objectKey: string }> };
    const referencedKeys = new Set(referenced.rows.map((row) => row.objectKey));
    return {
      items: candidates.filter((item) => !referencedKeys.has(item.objectKey)).map((item) => ({
        objectKey: item.objectKey,
        size: item.size,
        lastModified: item.lastModified?.toISOString() ?? null,
      })),
      continuationToken: page.continuationToken,
      hasMore: page.hasMore,
      graceHours,
    };
  }

  @Get('media/audio')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listAudioMedia(@Query('limit') limitValue?: string, @Query('continuationToken') continuationToken?: string) {
    const { limit } = parsePagination(limitValue, undefined, { defaultLimit: 50, maxLimit: 100, label: '音频分页' });
    const normalizedContinuationToken = continuationToken?.trim() || undefined;
    if (normalizedContinuationToken && normalizedContinuationToken.length > 2048) throw new BadRequestException('音频分页标记无效');
    const page = await this.storage.listObjects('content/audio/', limit, normalizedContinuationToken);
    return {
      items: page.items.filter((item) => item.objectKey.startsWith('content/audio/') && this.isManagedMediaObjectKey(item.objectKey)).map((item) => ({
        objectKey: item.objectKey,
        size: item.size,
        lastModified: item.lastModified?.toISOString() ?? null,
      })),
      continuationToken: page.continuationToken,
      hasMore: page.hasMore,
    };
  }

  @Get('home')
  @Header('Cache-Control', 'no-store')
  async home() {
    const cached = await this.redis.getJson<PublicHomeCache>(this.homeCacheKey);
    if (cached && this.isPublicHomeCache(cached)) return this.materializePublicHome(cached);
    // Content writes hold the same lock while committing and invalidating the
    // cache. Recheck inside it so an older miss cannot repopulate Redis after
    // a newer issue has been published.
    return this.database.withSessionAdvisoryLock('myriad-she-content-media', async (client) => {
      const lockedCached = await this.redis.getJson<PublicHomeCache>(this.homeCacheKey);
      if (lockedCached && this.isPublicHomeCache(lockedCached)) return this.materializePublicHome(lockedCached);
      const result = await client.query<{ snapshot: { issue: PublicHomeCache['issue']; sections: IssueModule[] }; version: number }>(
        `select publication.snapshot, publication.version
         from content_issues issue
         join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
         where issue.status = 'published' order by issue.updated_at desc limit 1`,
      );
      const publication = result.rows[0] ?? null;
      const issue = publication?.snapshot.issue ?? null;
      const publicIssue = issue ? {
        code: issue.code,
        label: issue.label,
        labelRichText: issue.labelRichText ?? '',
        month: issue.month,
        monthRichText: issue.monthRichText ?? '',
        theme: issue.theme,
        themeRichText: issue.themeRichText ?? '',
        question: issue.question,
        questionRichText: issue.questionRichText ?? '',
        microVoiceTitle: issue.microVoiceTitle,
        microVoiceDuration: issue.microVoiceDuration,
        homeMetaRichText: issue.homeMetaRichText,
        homeMetaFontSize: issue.homeMetaFontSize,
        homeMetaColor: issue.homeMetaColor,
        homeCoverCaptionLeft: issue.homeCoverCaptionLeft,
        homeCoverCaptionLeftRichText: issue.homeCoverCaptionLeftRichText ?? '',
        homeCoverCaptionRight: issue.homeCoverCaptionRight,
        homeCoverCaptionRightRichText: issue.homeCoverCaptionRightRichText ?? '',
        coverObjectKey: issue.coverObjectKey,
        microVoiceObjectKey: issue.microVoiceObjectKey,
        homeBackgroundObjectKey: issue.homeBackgroundObjectKey ?? null,
      } : null;
      const modules = (publication?.snapshot.sections ?? []).slice().sort((left, right) => left.order - right.order);
      const response: PublicHomeCache = {
        issue: publicIssue,
        question: issue?.question ?? '',
        sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
        publishedVersion: publication?.version ?? 0,
        modules,
      };
      await this.redis.setJson(this.homeCacheKey, response, this.publicContentCacheTtlSeconds());
      return this.materializePublicHome(response);
    });
  }

  @Get('archive')
  @Header('Cache-Control', 'no-store')
  async publicArchive() {
    // Read only each issue's immutable latest publication. Draft metadata and
    // draft content must never leak into the public archive.
    const result = await this.database.query(
      `select publication.snapshot->'issue'->>'code' as code,
              publication.snapshot->'issue'->>'label' as label,
              coalesce(publication.snapshot->'issue'->>'labelRichText', '') as "labelRichText",
              publication.snapshot->'issue'->>'month' as month,
              coalesce(publication.snapshot->'issue'->>'monthRichText', '') as "monthRichText",
              publication.snapshot->'issue'->>'theme' as theme,
              coalesce(publication.snapshot->'issue'->>'themeRichText', '') as "themeRichText",
              publication.snapshot->'issue'->>'question' as question,
              coalesce(publication.snapshot->'issue'->>'questionRichText', '') as "questionRichText",
              issue.status as status,
              publication.version as version,
              publication.published_at as "publishedAt"
       from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status in ('archived', 'published')
       order by publication.published_at asc, issue.id asc`,
    );
    return { issues: result.rows };
  }

  @Get('archive/:code')
  @Header('Cache-Control', 'no-store')
  async publicArchiveIssue(@Param('code') code: string) {
    const normalizedCode = code.trim();
    if (normalizedCode.length < 2 || normalizedCode.length > 64) throw new BadRequestException('期刊编号长度无效');
    const result = await this.database.query<{ snapshot: { issue: PublicHomeCache['issue']; sections: IssueModule[] }; version: number }>(
      `select publication.snapshot, publication.version
       from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status in ('archived', 'published')
         and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)
       order by publication.published_at desc limit 1`, [normalizedCode],
    );
    const publication = result.rows[0];
    if (!publication) throw new NotFoundException('该期内容不存在或尚未发布');
    const issue = publication.snapshot.issue;
    const response: PublicHomeCache = {
      issue,
      question: issue?.question ?? '',
      sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
      publishedVersion: publication.version,
      modules: (publication.snapshot.sections ?? []).slice().sort((left, right) => left.order - right.order),
    };
    return this.materializePublicHome(response);
  }

  @Get('media/view-url')
  @Header('Cache-Control', 'no-store')
  async mediaViewUrl(@Query('objectKey') objectKey?: string) {
    const normalizedObjectKey = objectKey?.trim() || undefined;
    if (!normalizedObjectKey || !this.isManagedMediaObjectKey(normalizedObjectKey)) {
      throw new BadRequestException('无效的媒体对象');
    }
    const result = await this.database.query(
      `select 1 from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version,
         jsonb_array_elements(coalesce(publication.snapshot->'sections', '[]'::jsonb)) module
       where issue.status = 'published' and (module->>'imageObjectKey' = $1 or module->>'audioObjectKey' = $1 or module->>'videoObjectKey' = $1
         or exists (select 1 from jsonb_array_elements(coalesce(module->'tracks', '[]'::jsonb)) track where track->>'audioObjectKey' = $1 or track->>'videoObjectKey' = $1))
       union all
       select 1 from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and (publication.snapshot->'issue'->>'coverObjectKey' = $1 or publication.snapshot->'issue'->>'microVoiceObjectKey' = $1 or publication.snapshot->'issue'->>'homeBackgroundObjectKey' = $1)
       union all
       select 1 from content_daily_objects daily,
         jsonb_array_elements(coalesce(daily.content->'products', '[]'::jsonb)) product
       where product->>'image' = $1 and product->>'enabled' = 'true'
       union all
       select 1 from content_daily_objects daily
       where daily.content->>'articleImage' = $1
       limit 1`, [normalizedObjectKey],
    );
    if (!result.rows[0]) throw new NotFoundException('媒体不存在或尚未发布');
    if (!this.isAllowedMediaObject(normalizedObjectKey, await this.storage.objectMetadata(normalizedObjectKey))) throw new NotFoundException('媒体对象不存在或类型无效');
    return this.storage.createDownloadUrl(normalizedObjectKey);
  }

  @Get('media/preview-url')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async mediaPreviewUrl(@Query('objectKey') objectKey?: string) {
    const normalizedObjectKey = objectKey?.trim() || undefined;
    if (!normalizedObjectKey || !this.isManagedMediaObjectKey(normalizedObjectKey)) {
      throw new BadRequestException('无效的媒体对象');
    }
    const metadata = await this.storage.objectMetadata(normalizedObjectKey);
    if (!this.isAllowedMediaObject(normalizedObjectKey, metadata)) {
      throw new NotFoundException('媒体对象不存在或类型无效');
    }
    // Unlike the public view URL, this admin-only URL can preview a freshly
    // uploaded but not-yet-published object while an issue is being edited.
    return this.storage.createDownloadUrl(normalizedObjectKey);
  }

  @Get('discussion')
  @Header('Cache-Control', 'no-store')
  async discussion(@Query('issueCode') issueCode?: string, @Req() request?: Request) {
    if (issueCode !== undefined && (typeof issueCode !== 'string' || issueCode.length < 2 || issueCode.length > 64)) throw new BadRequestException('期刊编号无效');
    const restriction = await this.activeDiscussionRestrictionForRequest(request);
    if (restriction) {
      const contacts = await readDiscussionSupportSettings(this.database);
      throw new ForbiddenException({ code: 'discussion_restricted', message: '一起谈谈权限已停用，暂时不能查看或参与讨论', reason: restriction.reason, endsAt: restriction.endsAt, ...contacts });
    }
    const result = await this.database.query<{ snapshot: { issue: { code: string; label: string }; discussion?: DiscussionContent }; version: number }>(
      `select publication.snapshot, publication.version from content_issues issue
       join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and ($1::text is null or publication.snapshot->'issue'->>'code' = $1)
       order by issue.updated_at desc limit 1`, [issueCode ?? null],
    );
    const publication = result.rows[0];
    if (!publication) throw new NotFoundException('本期讨论尚未发布或期刊已更新，请返回首页重试');
    const independent = await this.database.query<{ content: DiscussionContent; version: number }>(
      `select page.published_content as content, page.published_version as version
       from content_discussion_pages page
       join content_issues issue on issue.id = page.issue_id
       where issue.code = $1 and issue.status = 'published' and page.published_content is not null`,
      [publication.snapshot.issue.code],
    );
    const independentPage = independent.rows[0];
    const independentContent = independentPage?.content ? validateDiscussionContent(independentPage.content) : null;
    const editorialContent = independentContent
      ?? (publication.snapshot.discussion === undefined ? defaultDiscussionContent() : validateDiscussionContent(publication.snapshot.discussion));
    const content = this.encryption
      ? await mergePublishedCommunityContent(this.database, editorialContent, publication.snapshot.issue.code, this.encryption)
      : editorialContent;
    return {
      issueCode: publication.snapshot.issue.code, issueLabel: publication.snapshot.issue.label,
      publishedVersion: independentContent ? independentPage.version : publication.version,
      content,
    };
  }

  @Get('issues')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issues() {
    const result = await this.database.query(`select issue.id, issue.code, issue.label, issue.month, issue.theme, issue.question, issue.status,
      issue.edit_version as "editVersion", issue.micro_voice_title as "microVoiceTitle", issue.micro_voice_duration as "microVoiceDuration",
      issue.cover_object_key as "coverObjectKey", issue.micro_voice_object_key as "microVoiceObjectKey", issue.home_background_object_key as "homeBackgroundObjectKey", issue.home_meta_rich_text as "homeMetaRichText",
      issue.label_rich_text as "labelRichText", issue.month_rich_text as "monthRichText", issue.theme_rich_text as "themeRichText", issue.question_rich_text as "questionRichText",
      issue.home_meta_font_size as "homeMetaFontSize", issue.home_meta_color as "homeMetaColor", issue.home_cover_caption_left as "homeCoverCaptionLeft",
      issue.home_cover_caption_left_rich_text as "homeCoverCaptionLeftRichText", issue.home_cover_caption_right as "homeCoverCaptionRight",
      issue.home_cover_caption_right_rich_text as "homeCoverCaptionRightRichText", issue.draft_content as "draftContent", issue.published_version as "publishedVersion",
      publication.snapshot->'issue'->>'label' as "publishedLabel", publication.snapshot->'issue'->>'month' as "publishedMonth",
      publication.snapshot->'issue'->>'code' as "publishedCode", publication.snapshot->'issue'->>'theme' as "publishedTheme",
      publication.snapshot->'issue'->>'question' as "publishedQuestion",
      coalesce(publication.snapshot->'issue'->>'labelRichText', '') as "publishedLabelRichText",
      coalesce(publication.snapshot->'issue'->>'monthRichText', '') as "publishedMonthRichText",
      coalesce(publication.snapshot->'issue'->>'themeRichText', '') as "publishedThemeRichText",
      coalesce(publication.snapshot->'issue'->>'questionRichText', '') as "publishedQuestionRichText",
      publication.snapshot->'issue'->>'microVoiceTitle' as "publishedMicroVoiceTitle",
      publication.snapshot->'issue'->>'microVoiceDuration' as "publishedMicroVoiceDuration",
      publication.snapshot->'issue'->>'homeMetaRichText' as "publishedHomeMetaRichText",
      (publication.snapshot->'issue'->>'homeMetaFontSize')::int as "publishedHomeMetaFontSize",
      publication.snapshot->'issue'->>'homeMetaColor' as "publishedHomeMetaColor",
      publication.snapshot->'issue'->>'homeCoverCaptionLeft' as "publishedHomeCoverCaptionLeft",
      publication.snapshot->'issue'->>'homeCoverCaptionLeftRichText' as "publishedHomeCoverCaptionLeftRichText",
      publication.snapshot->'issue'->>'homeCoverCaptionRight' as "publishedHomeCoverCaptionRight",
      publication.snapshot->'issue'->>'homeCoverCaptionRightRichText' as "publishedHomeCoverCaptionRightRichText",
      issue.updated_at as "updatedAt"
      from content_issues issue left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
      order by issue.updated_at desc`);
    return result.rows.map((issue) => ({ ...issue, draftContent: { ...issue.draftContent, discussion: issue.draftContent?.discussion ? validateDiscussionContent(issue.draftContent.discussion) : defaultDiscussionContent() } }));
  }

  @Get('issues/:id/history')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issuePublicationHistory(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.database.query(
      `select publication.id, publication.version, publication.snapshot, publication.published_at as "publishedAt", publication.published_by as "publishedBy"
       from content_issue_publications publication where publication.issue_id = $1 order by publication.version desc limit 100`, [id],
    );
    return result.rows;
  }

  @Get('issues/summary')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async issueSummary() {
    const result = await this.database.query<{
      draftCount: string;
      publishedCount: string;
      archivedCount: string;
      publishedCode: string | null;
      publishedUpdatedAt: string | null;
    }>(
      `select
         count(*) filter (where status = 'draft')::text as "draftCount",
         count(*) filter (where status = 'published')::text as "publishedCount",
         count(*) filter (where status = 'archived')::text as "archivedCount",
         (select coalesce(publication.snapshot->'issue'->>'code', issue.code) from content_issues issue
          left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
          where issue.status = 'published' order by issue.updated_at desc, issue.id desc limit 1) as "publishedCode",
         (select updated_at from content_issues where status = 'published' order by updated_at desc, id desc limit 1) as "publishedUpdatedAt"
       from content_issues`,
    );
    const row = result.rows[0];
    return {
      draftCount: parseDatabaseCount(row?.draftCount ?? '0', '草稿期刊总数'),
      publishedCount: parseDatabaseCount(row?.publishedCount ?? '0', '已发布期刊总数'),
      archivedCount: parseDatabaseCount(row?.archivedCount ?? '0', '已归档期刊总数'),
      publishedCode: row?.publishedCode ?? null,
      publishedUpdatedAt: row?.publishedUpdatedAt ?? null,
    };
  }

  @Get('issues/:code')
  @Header('Cache-Control', 'no-store')
  async publishedIssue(@Param('code') code: string) {
    const normalizedCode = code.trim();
    if (normalizedCode.length < 2 || normalizedCode.length > 64) throw new BadRequestException('期刊编号长度无效');
    const result = await this.database.query(
      `select coalesce(publication.snapshot->'issue'->>'code', issue.code) as code,
              coalesce(publication.snapshot->'issue'->>'label', issue.label) as label,
              coalesce(publication.snapshot->'issue'->>'labelRichText', issue.label_rich_text, '') as "labelRichText",
              coalesce(publication.snapshot->'issue'->>'month', issue.month) as month,
              coalesce(publication.snapshot->'issue'->>'monthRichText', issue.month_rich_text, '') as "monthRichText",
              coalesce(publication.snapshot->'issue'->>'theme', issue.theme) as theme,
              coalesce(publication.snapshot->'issue'->>'themeRichText', issue.theme_rich_text, '') as "themeRichText",
              coalesce(publication.snapshot->'issue'->>'question', issue.question) as question,
              coalesce(publication.snapshot->'issue'->>'questionRichText', issue.question_rich_text, '') as "questionRichText"
       from content_issues issue
       left join content_issue_publications publication on publication.issue_id = issue.id and publication.version = issue.published_version
       where issue.status = 'published' and (issue.code = $1 or publication.snapshot->'issue'->>'code' = $1)`, [normalizedCode],
    );
    if (!result.rows[0]) throw new NotFoundException('本期问题不存在或尚未发布');
    return result.rows[0];
  }

  @Post('issues')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async createIssue(@Req() request: Request & { user?: { sub: string } }, @Body() body: IssueDto) {
    const normalized = this.normalizeIssueInput(body, true);
    const draftContent = this.validateIssueDraft(normalized.draftContent ?? this.legacyIssueDraft(normalized));
    try {
      const issue = await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        await this.validateMediaKeys({
          coverObjectKey: normalized.coverObjectKey ?? undefined,
          microVoiceObjectKey: normalized.microVoiceObjectKey ?? undefined,
          homeBackgroundObjectKey: normalized.homeBackgroundObjectKey ?? undefined,
        });
        const result = await client.query(
          `insert into content_issues (code, label, label_rich_text, month, month_rich_text, theme, theme_rich_text, question, question_rich_text, micro_voice_title, micro_voice_duration, cover_object_key, micro_voice_object_key, home_background_object_key, home_meta_rich_text, home_meta_font_size, home_meta_color, home_cover_caption_left, home_cover_caption_left_rich_text, home_cover_caption_right, home_cover_caption_right_rich_text, status, draft_content)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'draft',$22::jsonb) returning id, code, label, label_rich_text as "labelRichText", month, month_rich_text as "monthRichText", theme, theme_rich_text as "themeRichText", question, question_rich_text as "questionRichText", status, edit_version as "editVersion", draft_content as "draftContent", cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_background_object_key as "homeBackgroundObjectKey", home_meta_rich_text as "homeMetaRichText", home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft", home_cover_caption_left_rich_text as "homeCoverCaptionLeftRichText", home_cover_caption_right as "homeCoverCaptionRight", home_cover_caption_right_rich_text as "homeCoverCaptionRightRichText"`,
          [normalized.code, normalized.label, normalized.labelRichText ?? '', normalized.month, normalized.monthRichText ?? '', normalized.theme, normalized.themeRichText ?? '', normalized.question, normalized.questionRichText ?? '', normalized.microVoiceTitle ?? null, normalized.microVoiceDuration ?? null, normalized.coverObjectKey ?? null, normalized.microVoiceObjectKey ?? null, normalized.homeBackgroundObjectKey ?? null, normalized.homeMetaRichText ?? '', normalized.homeMetaFontSize ?? 16, normalized.homeMetaColor ?? '#40362f', normalized.homeCoverCaptionLeft, normalized.homeCoverCaptionLeftRichText ?? '', normalized.homeCoverCaptionRight, normalized.homeCoverCaptionRightRichText ?? '', JSON.stringify(draftContent)],
        );
        const issue = result.rows[0];
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.issue.created', resourceType: 'content_issue', resourceId: issue?.id, metadata: { code: normalized.code, status: 'draft' } }, client);
        if (!(await this.invalidateHomeCache())) {
          throw this.homeCacheUnavailable();
        }
        return issue;
      });
      return issue;
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  /** 草稿可以保留未上传音频的条目；发布时只保留有音频的条目，最多 20 段。 */
  private isPlayableAudioTrack(track: Partial<IssueAudioTrack>) {
    const key = track.mediaType === 'video' ? track.videoObjectKey : track.audioObjectKey;
    return typeof key === 'string' && key.trim().length > 0;
  }

  private normalizePublishAudioTracks(sections: IssueModule[]) {
    for (const module of sections) {
      if (module.type !== 'audio' || !Array.isArray(module.tracks) || module.tracks.length === 0) continue;
      const playableTracks = module.tracks.filter((track) => this.isPlayableAudioTrack(track));
      if (playableTracks.length === 0) continue;
      module.tracks = playableTracks;
      const first = playableTracks[0];
      module.mediaType = first.mediaType === 'video' ? 'video' : 'audio';
      module.audioObjectKey = first.audioObjectKey || '';
      module.videoObjectKey = first.videoObjectKey || '';
      module.title = first.title;
      module.duration = first.duration;
      module.detailTitle = first.detailTitle;
      module.description = first.description;
      module.quote = first.quote;
      module.subtitle = first.subtitle;
      module.transcript = first.transcript;
      module.titleRichText = first.titleRichText;
      module.detailTitleRichText = first.detailTitleRichText;
      module.descriptionRichText = first.descriptionRichText;
      module.quoteRichText = first.quoteRichText;
      module.subtitleRichText = first.subtitleRichText;
      module.transcriptRichText = first.transcriptRichText;
    }
  }

  @Post('issues/:id/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishIssue(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: { editVersion?: number }) {
    if (!Number.isSafeInteger(body.editVersion) || Number(body.editVersion) < 1) throw new BadRequestException('期刊版本无效，请重新读取草稿');
    try {
      return await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        const selected = await client.query<Record<string, any>>(
          `select id, code, label, label_rich_text as "labelRichText", month, month_rich_text as "monthRichText", theme, theme_rich_text as "themeRichText", question, question_rich_text as "questionRichText", micro_voice_title as "microVoiceTitle", micro_voice_duration as "microVoiceDuration",
                  cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_background_object_key as "homeBackgroundObjectKey", home_meta_rich_text as "homeMetaRichText",
                  home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft",
                  home_cover_caption_left_rich_text as "homeCoverCaptionLeftRichText", home_cover_caption_right as "homeCoverCaptionRight",
                  home_cover_caption_right_rich_text as "homeCoverCaptionRightRichText", draft_content as "draftContent", edit_version as "editVersion", published_version as "publishedVersion", status
           from content_issues where id = $1 for update`, [id],
        );
        const issue = selected.rows[0];
        if (!issue) throw new NotFoundException('期刊不存在');
        if (issue.editVersion !== body.editVersion) throw new ConflictException({ code: 'content_issue_changed', message: '草稿已被其他管理员修改，请载入最新版本后核对' });
        const draft = this.validateIssueDraft(issue.draftContent);
        this.normalizePublishAudioTracks(draft.sections);
        const enabled = draft.sections.filter((item) => item.enabled);
        for (const type of ['issueMeta', 'question', 'observationAction', 'sharedPracticeAction'] as const) {
          if (!enabled.some((item) => item.type === type)) throw new BadRequestException(`发布内容缺少必需栏目：${type}`);
        }
        const question = enabled.find((item) => item.type === 'question');
        const issueMeta = enabled.find((item) => item.type === 'issueMeta');
        const coverStory = enabled.find((item) => item.type === 'coverStory');
        const opener = coverStory ?? enabled.find((item) => item.type === 'opener');
        if (!this.boundedText(question?.title, 500, 2) || !this.boundedText(opener?.title, 200, 2)) throw new BadRequestException('本期主题与问题不能为空');
        if (!coverStory && !enabled.some((item) => item.type === 'cover')) throw new BadRequestException('发布内容缺少必需栏目：cover');
        if (!coverStory && !enabled.some((item) => item.type === 'opener')) throw new BadRequestException('发布内容缺少必需栏目：opener');
        const hasEditorialImage = enabled.some((item) => ['cover', 'coverStory', 'image', 'story'].includes(item.type)
          && typeof item.imageObjectKey === 'string' && item.imageObjectKey.length > 0);
        if (!hasEditorialImage) throw new BadRequestException('发布前至少需要一张封面或人物图片');
        for (const module of enabled) {
          if ((module.type === 'cover' || module.type === 'image') && (typeof module.imageObjectKey !== 'string' || !module.imageObjectKey)) throw new BadRequestException('启用的图片栏目必须上传图片');
          if (module.type === 'story' && module.imageObjectKey && (!module.altText || typeof module.altText !== 'string')) throw new BadRequestException('人物图文栏目上传图片后必须填写替代文本');
      if (module.type === 'audio') {
        const tracks = module.tracks?.length ? module.tracks : [module as IssueModule & Partial<IssueAudioTrack>];
        if (!tracks.some((track) => this.isPlayableAudioTrack(track))) throw new BadRequestException('启用的微声音至少需要上传 1 段音频或视频');
      }
        }
        for (const module of draft.sections) {
          if (typeof module.imageObjectKey === 'string' && module.imageObjectKey) await this.validateMediaKeys({ coverObjectKey: module.imageObjectKey });
          const tracks = module.type === 'audio' && module.tracks?.length
            ? module.tracks
            : [{ audioObjectKey: module.audioObjectKey, videoObjectKey: module.videoObjectKey }];
          for (const track of tracks) {
            if (typeof track.audioObjectKey === 'string' && track.audioObjectKey) await this.validateMediaKeys({ microVoiceObjectKey: track.audioObjectKey });
            if (typeof track.videoObjectKey === 'string' && track.videoObjectKey) await this.validateMediaKeys({ videoObjectKey: track.videoObjectKey });
          }
        }
        if (issue.homeBackgroundObjectKey) await this.validateMediaKeys({ homeBackgroundObjectKey: issue.homeBackgroundObjectKey });
        const coverSection = draft.sections.find((item) => item.type === 'coverStory' || item.type === 'cover');
        const audio = draft.sections.find((item) => item.type === 'audio');
        const snapshot = {
          issue: {
            code: issue.code,
            label: issue.label,
            labelRichText: typeof issueMeta?.eyebrowRichText === 'string' ? issueMeta.eyebrowRichText : (issue.labelRichText ?? ''),
            month: typeof issueMeta?.month === 'string' && issueMeta.month ? issueMeta.month : issue.month,
            monthRichText: typeof issueMeta?.monthRichText === 'string' ? issueMeta.monthRichText : (issue.monthRichText ?? ''),
            theme: String(opener?.title || issue.theme),
            themeRichText: typeof opener?.titleRichText === 'string' ? opener.titleRichText : (issue.themeRichText ?? ''),
            question: String(question.title),
            questionRichText: typeof question?.titleRichText === 'string' ? question.titleRichText : (issue.questionRichText ?? ''),
            microVoiceTitle: audio?.title ?? issue.microVoiceTitle,
            microVoiceDuration: audio?.duration ?? issue.microVoiceDuration,
            homeMetaRichText: issue.homeMetaRichText, homeMetaFontSize: issue.homeMetaFontSize, homeMetaColor: issue.homeMetaColor,
            homeCoverCaptionLeft: coverSection?.captionLeft ?? issue.homeCoverCaptionLeft,
            homeCoverCaptionLeftRichText: typeof coverSection?.captionLeftRichText === 'string'
              ? coverSection.captionLeftRichText
              : (issue.homeCoverCaptionLeftRichText ?? ''),
            homeCoverCaptionRight: coverSection?.captionRight ?? issue.homeCoverCaptionRight,
            homeCoverCaptionRightRichText: typeof coverSection?.captionRightRichText === 'string'
              ? coverSection.captionRightRichText
              : (issue.homeCoverCaptionRightRichText ?? ''),
            coverObjectKey: coverSection?.imageObjectKey ?? issue.coverObjectKey,
            microVoiceObjectKey: audio?.audioObjectKey ?? issue.microVoiceObjectKey,
            homeBackgroundObjectKey: issue.homeBackgroundObjectKey || null,
          },
          sections: draft.sections,
          discussion: draft.discussion,
        };
        const version = Number(issue.publishedVersion || 0) + 1;
        await this.archiveOtherPublishedIssues(client, request.user?.sub || 'admin:unknown', id);
        await client.query(`insert into content_issue_publications (issue_id, version, snapshot, published_by) values ($1, $2, $3::jsonb, $4)`, [id, version, JSON.stringify(snapshot), request.user?.sub || null]);
        await client.query(`update content_issues set status = 'published', published_version = $2, edit_version = edit_version + 1, updated_at = now() where id = $1`, [id, version]);
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.issue.published', resourceType: 'content_issue', resourceId: id, metadata: { code: issue.code, version, moduleCount: draft.sections.length } }, client);
        if (!(await this.invalidateHomeCache())) throw this.homeCacheUnavailable();
        return { published: true, version };
      });
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  @Patch('issues/:id')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateIssue(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateIssueDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('期刊版本无效，请刷新列表后重新打开再编辑');
    const normalized = this.normalizeIssueInput(body, false);
    const allowed: Record<string, string> = { code: 'code', label: 'label', labelRichText: 'label_rich_text', month: 'month', monthRichText: 'month_rich_text', theme: 'theme', themeRichText: 'theme_rich_text', question: 'question', questionRichText: 'question_rich_text', microVoiceTitle: 'micro_voice_title', microVoiceDuration: 'micro_voice_duration', coverObjectKey: 'cover_object_key', microVoiceObjectKey: 'micro_voice_object_key', homeBackgroundObjectKey: 'home_background_object_key', homeMetaRichText: 'home_meta_rich_text', homeMetaFontSize: 'home_meta_font_size', homeMetaColor: 'home_meta_color', homeCoverCaptionLeft: 'home_cover_caption_left', homeCoverCaptionLeftRichText: 'home_cover_caption_left_rich_text', homeCoverCaptionRight: 'home_cover_caption_right', homeCoverCaptionRightRichText: 'home_cover_caption_right_rich_text', draftContent: 'draft_content' };
    const fields = Object.entries(normalized).filter(([key, value]) => allowed[key] && value !== undefined);
    if (!fields.length) return { updated: false };
    const values = fields.map(([key, value]) => key === 'draftContent'
      ? JSON.stringify(this.validateIssueDraft(value))
      : key === 'homeBackgroundObjectKey' && !value ? null : value);
    const assignments = fields.map(([key], index) => `${allowed[key]} = $${index + 1}${key === 'draftContent' ? '::jsonb' : ''}`);
    values.push(id);
    try {
      const issue = await this.database.withTransaction(async (client) => {
        await client.query(`select pg_advisory_xact_lock(hashtext('myriad-she-content-media'))`);
        const current = await client.query<{ coverObjectKey: string | null; microVoiceObjectKey: string | null; homeBackgroundObjectKey: string | null; code: string; status: 'draft' | 'published' | 'archived'; editVersion: number }>(
          `select cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_background_object_key as "homeBackgroundObjectKey", code, status, edit_version as "editVersion"
           from content_issues where id = $1 for update`, [id],
        );
        if (!current.rows[0]) return { updated: false };
        if (current.rows[0].editVersion !== body.editVersion) {
          throw new ConflictException({ code: 'content_issue_changed', message: '期刊版本已变化，请载入云端最新版本并核对合并内容后再保存。' });
        }
        const coverChanged = normalized.coverObjectKey !== undefined && normalized.coverObjectKey !== current.rows[0].coverObjectKey;
        const voiceChanged = normalized.microVoiceObjectKey !== undefined && normalized.microVoiceObjectKey !== current.rows[0].microVoiceObjectKey;
        const backgroundChanged = normalized.homeBackgroundObjectKey !== undefined && normalized.homeBackgroundObjectKey !== current.rows[0].homeBackgroundObjectKey;
        if (coverChanged || voiceChanged || backgroundChanged) {
          await this.validateMediaKeys({
            ...(coverChanged ? { coverObjectKey: normalized.coverObjectKey || undefined } : {}),
            ...(voiceChanged ? { microVoiceObjectKey: normalized.microVoiceObjectKey || undefined } : {}),
            ...(backgroundChanged ? { homeBackgroundObjectKey: normalized.homeBackgroundObjectKey || undefined } : {}),
          });
        }
        const result = await client.query(`update content_issues set ${assignments.join(', ')}, edit_version = edit_version + 1, updated_at = now() where id = $${values.length} returning id, code, label, label_rich_text as "labelRichText", month, month_rich_text as "monthRichText", theme, theme_rich_text as "themeRichText", question, question_rich_text as "questionRichText", status, edit_version as "editVersion", cover_object_key as "coverObjectKey", micro_voice_object_key as "microVoiceObjectKey", home_background_object_key as "homeBackgroundObjectKey", home_meta_rich_text as "homeMetaRichText", home_meta_font_size as "homeMetaFontSize", home_meta_color as "homeMetaColor", home_cover_caption_left as "homeCoverCaptionLeft", home_cover_caption_left_rich_text as "homeCoverCaptionLeftRichText", home_cover_caption_right as "homeCoverCaptionRight", home_cover_caption_right_rich_text as "homeCoverCaptionRightRichText"`, values);
        if (result.rows[0]) {
          await this.audit.record({
            actorType: 'admin',
            actorId: request.user?.sub,
            action: 'content.issue.updated',
            resourceType: 'content_issue',
            resourceId: id,
            metadata: {
              code: current.rows[0].code,
              fields: fields.map(([key]) => key),
            },
          }, client);
          if (!(await this.invalidateHomeCache())) {
            throw this.homeCacheUnavailable();
          }
        }
        return result.rows[0] ?? { updated: false };
      });
      if (issue && 'updated' in issue && issue.updated === false) return issue;
      return issue;
    } catch (error) {
      throw this.contentConflict(error);
    }
  }

  @Patch('issues/:id/lifecycle')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateIssueLifecycle(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: IssueLifecycleDto) {
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ id: string; code: string; status: 'draft' | 'published' | 'archived'; editVersion: number }>(
        `select id, code, status, edit_version as "editVersion" from content_issues where id = $1 for update`, [id],
      );
      const issue = current.rows[0];
      if (!issue) throw new NotFoundException('期刊不存在');
      if (issue.editVersion !== body.editVersion) {
        throw new ConflictException({ code: 'content_issue_changed', message: '期刊版本已变化，请刷新列表后重试' });
      }
      const allowed = (issue.status === 'published' && body.status === 'archived')
        || (issue.status === 'archived' && body.status === 'draft');
      if (!allowed) {
        throw new ConflictException({ code: 'content_issue_transition_invalid', message: '当前期刊状态不支持该操作，请刷新列表后重试' });
      }
      const updated = await client.query<{ id: string; code: string; status: 'archived' | 'draft'; editVersion: number }>(
        `update content_issues set status = $1, edit_version = edit_version + 1, updated_at = now()
         where id = $2
         returning id, code, status, edit_version as "editVersion"`, [body.status, id],
      );
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: body.status === 'archived' ? 'content.issue.archived' : 'content.issue.restored',
        resourceType: 'content_issue',
        resourceId: id,
        metadata: { code: issue.code, from: issue.status, to: body.status },
      }, client);
      if (!(await this.invalidateHomeCache())) throw this.homeCacheUnavailable();
      return updated.rows[0];
    });
  }

  @Delete('issues/:id')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async deleteIssue(@Req() request: Request & { user?: { sub: string } }, @Param('id', ParseUUIDPipe) id: string, @Body() body: DeleteIssueDto) {
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ id: string; code: string; status: 'draft' | 'published' | 'archived'; editVersion: number; publishedVersion: number }>(
        `select id, code, status, edit_version as "editVersion", published_version as "publishedVersion"
         from content_issues where id = $1 for update`, [id],
      );
      const issue = current.rows[0];
      if (!issue) throw new NotFoundException('期刊不存在');
      if (issue.editVersion !== body.editVersion) {
        throw new ConflictException({ code: 'content_issue_changed', message: '期刊版本已变化，请刷新列表后重试' });
      }
      await client.query('delete from content_issue_publications where issue_id = $1', [id]);
      await client.query('delete from content_issues where id = $1', [id]);
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.issue.deleted',
        resourceType: 'content_issue',
        resourceId: id,
        metadata: { code: issue.code, status: issue.status, publishedVersion: issue.publishedVersion },
      }, client);
      if (!(await this.invalidateHomeCache())) throw this.homeCacheUnavailable();
      return { deleted: true, id, code: issue.code };
    });
  }

  /**
   * 解析共同实践文案与线下活动发布状态：指定期刊时读取该期，缺失字段回落到全局值。
   * 返回值统一为列表化结构（onlineParagraphs / rules）。
   */
  private async resolveSharedPracticeCopy(client: PoolClient, globalCopy: unknown, issueCode?: string) {
    const code = (issueCode ?? '').trim();
    const fallback = normalizeSharedPracticeCopy(globalCopy);
    if (!code || code.length > 64) return { copy: fallback, offlineActivitiesPublished: false };
    const issue = await client.query<{ id: string }>('select id from content_issues where code = $1', [code]);
    const issueId = issue.rows[0]?.id;
    if (!issueId) return { copy: fallback, offlineActivitiesPublished: false };
    const stored = await client.query<{ copy: unknown; offlineActivitiesPublished: boolean }>(
      'select copy, offline_activities_published as "offlineActivitiesPublished" from content_issue_practice_copy where issue_id = $1',
      [issueId],
    );
    const row = stored.rows[0];
    if (!row) return { copy: fallback, offlineActivitiesPublished: false };
    return {
      copy: normalizeSharedPracticeCopy({ ...((globalCopy as Record<string, unknown>) ?? {}), ...((row.copy as Record<string, unknown>) ?? {}) }),
      offlineActivitiesPublished: row.offlineActivitiesPublished === true,
    };
  }

  /** 公开页面未指定期号时，取最新已发布期刊；没有已发布期刊则不展示线下活动。 */
  private async resolvePublishedPracticeIssueCode(client: PoolClient, issueCode?: string) {
    const code = (issueCode ?? '').trim();
    if (code) return code;
    const issue = await client.query<{ code: string }>(
      "select code from content_issues where status = 'published' order by updated_at desc, id desc limit 1",
    );
    return issue.rows[0]?.code ?? '';
  }

  private async readPracticeContent(issueCode?: string, useLatestPublishedIssue = false) {
    return this.database.withTransaction(async (client) => {
      await client.query('set transaction isolation level repeatable read');
      const pageResult = await client.query<{ title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: unknown; sharedPracticeCopy: unknown; footerCopy: unknown; editVersion: number }>(`select title, title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor", intro, intro_rich_text as "introRichText", intro_font_size as "introFontSize", intro_color as "introColor", meta_left_rich_text as "metaLeftRichText", meta_left_font_size as "metaLeftFontSize", meta_left_color as "metaLeftColor", meta_right_rich_text as "metaRightRichText", meta_right_font_size as "metaRightFontSize", meta_right_color as "metaRightColor", observation_copy as "observationCopy", shared_practice_copy as "sharedPracticeCopy", footer_copy as "footerCopy", edit_version as "editVersion" from content_practice_page where id = 1`);
      const entriesResult = await client.query<{ key: PracticeEntryKey; target: string | null; title: string; description: string; enabled: boolean; contextRichText: string; contextFontSize: number; contextColor: string; titleRichText: string; titleFontSize: number; titleColor: string; descriptionRichText: string; descriptionFontSize: number; descriptionColor: string }>(
        `select key, target, title, description, enabled,
                context_rich_text as "contextRichText", context_font_size as "contextFontSize", context_color as "contextColor",
                title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor",
                description_rich_text as "descriptionRichText", description_font_size as "descriptionFontSize", description_color as "descriptionColor"
         from content_practice_entries order by sort_order, key`,
      );
      if (!pageResult.rows[0] || entriesResult.rows.length === 0) {
        throw new NotFoundException('实践页面内容尚未初始化');
      }
      const entries = entriesResult.rows.map((entry) => ({
        ...entry,
        target: entry.target ?? entry.key,
        contextRichText: sanitizeMinePageRichText(entry.contextRichText, 240, '实践目录情境文案'),
        titleRichText: sanitizeMinePageRichText(entry.titleRichText, 80, '实践目录名称'),
        descriptionRichText: sanitizeMinePageRichText(entry.descriptionRichText, 240, '实践目录补充说明'),
      }));
      const page = pageResult.rows[0];
      const resolvedIssueCode = useLatestPublishedIssue
        ? await this.resolvePublishedPracticeIssueCode(client, issueCode)
        : (issueCode ?? '').trim();
      const sharedPractice = await this.resolveSharedPracticeCopy(client, page.sharedPracticeCopy, resolvedIssueCode);
      return {
        ...page,
        titleRichText: sanitizeMinePageRichText(page.titleRichText || page.title, 80, '实践页面标题'),
        introRichText: sanitizeMinePageRichText(page.introRichText || page.intro, 240, '实践页面说明'),
        metaLeftRichText: sanitizeMinePageRichText(page.metaLeftRichText, 80, '实践页左侧页眉'),
        metaRightRichText: sanitizeMinePageRichText(page.metaRightRichText, 80, '实践页右侧页眉'),
        observationCopy: sanitizeObservationCopy(page.observationCopy),
        sharedPracticeCopy: sharedPractice.copy,
        offlineActivitiesPublished: sharedPractice.offlineActivitiesPublished,
        footerCopy: sanitizePracticeFooterCopy(page.footerCopy),
        entries,
      };
    });
  }

  @Get('practice')
  @Header('Cache-Control', 'no-store')
  practice(@Query('issueCode') issueCode?: string) {
    return this.readPracticeContent(issueCode, true);
  }

  @Get('brand-popup')
  @Header('Cache-Control', 'no-store')
  async brandPopup() {
    const result = await this.database.query<{ key: string; value: unknown }>(
      `select key, value from system_settings where key = any($1::text[])`,
      [['brand_popup_enabled', 'brand_popup_image', 'brand_popup_duration', 'brand_popup_frequency', 'brand_popup_alt', 'brand_popup_closable']],
    );
    const settings = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
    const objectKey = typeof settings.brand_popup_image === 'string' ? settings.brand_popup_image.trim() : '';
    if (settings.brand_popup_enabled !== true || !objectKey.startsWith('content/image/')) return { enabled: false };

    let imageUrl = '';
    try {
      const metadata = await this.storage.objectMetadata(objectKey);
      if (!this.isAllowedMediaObject(objectKey, metadata)) return { enabled: false };
      imageUrl = (await this.storage.createDownloadUrl(objectKey)).url;
    } catch {
      return { enabled: false };
    }
    if (!imageUrl) return { enabled: false };

    const configuredDuration = Number(settings.brand_popup_duration);
    const frequency = settings.brand_popup_frequency;
    return {
      enabled: true,
      imageUrl,
      durationSeconds: Number.isInteger(configuredDuration) && configuredDuration >= 1 && configuredDuration <= 15 ? configuredDuration : 3,
      frequency: frequency === 'daily' || frequency === 'once' ? frequency : 'every_launch',
      altText: typeof settings.brand_popup_alt === 'string' ? settings.brand_popup_alt.trim().slice(0, 120) : '',
      closable: settings.brand_popup_closable !== false,
    };
  }

  @Get('store-status')
  @Header('Cache-Control', 'no-store')
  async storeStatus() {
    return { open: await this.isStoreOpen() };
  }

  /**
   * 商城总闸：系统设置里的 store_enabled 与实践入口 daily-goods 必须同时开启。
   * 任一关闭时，日常之物不对外提供商品，避免后台显示“未开放”而前端仍在售。
   */
  private async isStoreOpen() {
    const result = await this.database.query<{ store: unknown; entryEnabled: unknown }>(
      `select (select value from system_settings where key = 'store_enabled') as store,
              (select enabled from content_practice_entries where coalesce(target, key) = 'daily-goods' order by sort_order limit 1) as "entryEnabled"`,
    );
    const row = result.rows[0];
    return row?.store === true && row?.entryEnabled === true;
  }

  private async readDailyObjectsContent() {
    const result = await this.database.query<{ content: unknown; editVersion: number }>(
      `select content, edit_version as "editVersion" from content_daily_objects where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('日常之物页面尚未初始化');
    return normalizeDailyObjectsContent(result.rows[0].content, result.rows[0].editVersion);
  }

  private async resolveDailyObjectImageUrl(image: string) {
    if (image.startsWith('content/image/')) {
      try {
        const metadata = await this.storage.objectMetadata(image);
        if (!this.isAllowedMediaObject(image, metadata)) return '';
        return (await this.storage.createDownloadUrl(image)).url;
      } catch {
        return '';
      }
    }
    return image.startsWith('/assets/') || /^https:\/\/[^\s]+$/i.test(image) ? image : '';
  }

  @Get('daily-objects')
  @Header('Cache-Control', 'no-store')
  async dailyObjects() {
    const content = await this.readDailyObjectsContent();
    const articleImageUrl = await this.resolveDailyObjectImageUrl(content.articleImage);
    const publicContent = { ...content, articleImageUrl };
    // 未开放时不下发商品（含价格与图片签名），只保留页面文案供落地页使用。
    if (!(await this.isStoreOpen())) return { ...publicContent, products: [] };
    const products = await Promise.all(content.products.map(async (product) => {
      const image = typeof product.image === 'string' ? product.image : '';
      if (!product.enabled || !image.startsWith('content/image/')) return product;
      return { ...product, image: await this.resolveDailyObjectImageUrl(image) };
    }));
    return { ...publicContent, products };
  }

  @Get('life-card')
  @Header('Cache-Control', 'no-store')
  async lifeCard(@Query('month') monthValue?: string, @Query('day') dayValue?: string) {
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards where month = $1 and day = $2`,
      [month, day],
    );
    if (!result.rows[0]) throw new NotFoundException('这一天的生命牌文案尚未设置');
    return result.rows[0];
  }

  @Post('life-card/view')
  @UseGuards(UserAuthGuard)
  @Header('Cache-Control', 'no-store')
  async recordLifeCardView(
    @Req() request: Request & { user?: { sub: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const userId = request.user?.sub;
    if (!userId) throw new BadRequestException('需要用户身份');
    const month = Number(body.month);
    const day = Number(body.day);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const card = await this.database.query<{ suit: string; rank: string }>(
      `select suit, rank from content_life_cards where month = $1 and day = $2`,
      [month, day],
    );
    if (!card.rows[0]) throw new NotFoundException('这一天的生命牌尚未设置');
    const inserted = await this.database.query<{ id: string; viewedAt: string }>(
      `insert into life_card_views (user_id, month, day, suit, rank)
       values ($1, $2, $3, $4, $5)
       returning id, viewed_at as "viewedAt"`,
      [userId, month, day, card.rows[0].suit, card.rows[0].rank],
    );
    return { id: inserted.rows[0]?.id ?? '', viewedAt: inserted.rows[0]?.viewedAt ?? '' };
  }

  @Get('life-card-views/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listLifeCardViews(
    @Query('limit') limitValue?: string,
    @Query('offset') offsetValue?: string,
    @Query('from') fromValue?: string,
    @Query('to') toValue?: string,
    @Query('user') userValue?: string,
    @Query('suit') suitValue?: string,
    @Query('rank') rankValue?: string,
  ) {
    const { limit, offset } = parsePagination(limitValue, offsetValue, { defaultLimit: 30, maxLimit: 100, label: '查看记录分页' });
    const conditions: string[] = [];
    const values: unknown[] = [];
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (fromValue && datePattern.test(fromValue)) {
      values.push(fromValue);
      conditions.push(`(v.viewed_at at time zone 'Asia/Shanghai')::date >= $${values.length}::date`);
    }
    if (toValue && datePattern.test(toValue)) {
      values.push(toValue);
      conditions.push(`(v.viewed_at at time zone 'Asia/Shanghai')::date <= $${values.length}::date`);
    }
    const user = (userValue ?? '').trim().slice(0, 64);
    if (user) {
      values.push(`%${user}%`);
      conditions.push(`(coalesce(u.nickname, '') ilike $${values.length} or v.user_id::text ilike $${values.length})`);
    }
    if (suitValue && lifeCardSuits.includes(suitValue as typeof lifeCardSuits[number])) {
      values.push(suitValue);
      conditions.push(`v.suit = $${values.length}`);
    }
    if (rankValue && lifeCardRanks.includes(rankValue as typeof lifeCardRanks[number])) {
      values.push(rankValue);
      conditions.push(`v.rank = $${values.length}`);
    }
    const filter = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const pageQuery = `select v.id, v.user_id as "userId", u.nickname, v.month, v.day, v.suit, v.rank, v.viewed_at as "viewedAt"
           from life_card_views v
           left join users u on u.id = v.user_id
          ${filter}
          order by v.viewed_at desc
          limit $${values.length + 1} offset $${values.length + 2}`;
    const totalQuery = `select count(*)::text as total
           from life_card_views v
           left join users u on u.id = v.user_id
          ${filter}`;
    const [rows, total] = await Promise.all([
      this.database.query<{ id: string; userId: string; nickname: string | null; month: number; day: number; suit: string; rank: string; viewedAt: string }>(
        pageQuery,
        [...values, limit, offset],
      ),
      this.database.query<{ total: string }>(totalQuery, values),
    ]);
    return { items: rows.rows, total: parseDatabaseCount(total.rows[0]?.total), limit, offset };
  }
  @Get('life-cards/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async listLifeCards() {
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards order by month, day`,
    );
    return { items: result.rows, suits: lifeCardSuits, ranks: lifeCardRanks };
  }

  @Get('life-cards/manage/export')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async exportLifeCards(@Res() response: Response) {
    const result = await this.database.query<LifeCardRow>(
      `select month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote" from content_life_cards order by month, day`,
    );
    const header = ['month', 'day', 'suit', 'rank', 'theme', 'title', 'summary', 'prompt', 'note', 'sourceNote'];
    const rows = result.rows.map((row) => [
      String(row.month), String(row.day), row.suit, row.rank, row.theme, row.title, row.summary, row.prompt, row.note, row.sourceNote,
    ]);
    const csv = [header, ...rows].map((cells) => cells.map(toCsvCell).join(',')).join('\r\n');
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="life-cards-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(`\uFEFF${csv}`);
  }

  @Post('life-cards/manage/import')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async importLifeCards(@Body() body: Record<string, unknown>, @Req() request: Request & { user?: { sub: string } }) {
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (!csv.trim()) throw new BadRequestException('导入内容为空');
    const table = parseCsv(csv);
    if (!table.length) throw new BadRequestException('导入内容无法解析');
    const header = table[0].map((cell) => cell.trim());
    const index = (name: string) => header.indexOf(name);
    const required = ['month', 'day', 'suit', 'rank', 'title', 'summary', 'prompt'];
    if (required.some((key) => index(key) < 0)) throw new BadRequestException('缺少必要列：month, day, suit, rank, title, summary, prompt');
    const updated: string[] = [];
    const skipped: string[] = [];
    await this.database.withTransaction(async (client) => {
      for (const row of table.slice(1)) {
        if (!row.length || row.every((cell) => !cell.trim())) continue;
        const month = Number(row[index('month')]);
        const day = Number(row[index('day')]);
        const suit = (row[index('suit')] || '').trim();
        const rank = (row[index('rank')] || '').trim();
        const title = (row[index('title')] || '').trim().slice(0, lifeCardTextLimits.title);
        const summary = (row[index('summary')] || '').trim().slice(0, lifeCardTextLimits.summary);
        const prompt = (row[index('prompt')] || '').trim().slice(0, lifeCardTextLimits.prompt);
        const theme = (row[index('theme')] ?? '').trim().slice(0, lifeCardTextLimits.theme);
        const note = (row[index('note')] ?? '').trim().slice(0, lifeCardTextLimits.note);
        const sourceNote = (row[index('sourceNote')] ?? '').trim().slice(0, lifeCardTextLimits.sourceNote);
        const valid = Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= 31
          && lifeCardSuits.includes(suit as typeof lifeCardSuits[number]) && lifeCardRanks.includes(rank as typeof lifeCardRanks[number])
          && title && summary && prompt;
        if (!valid) { skipped.push(`${month}-${day}`); continue; }
        const result = await client.query(
          `update content_life_cards
              set suit = $3, rank = $4, theme = $5, title = $6, summary = $7, prompt = $8, note = $9, source_note = $10, updated_at = now(), updated_by = $11
            where month = $1 and day = $2
            returning month, day`,
          [month, day, suit, rank, theme, title, summary, prompt, note, sourceNote, request.user?.sub ?? null],
        );
        if (result.rows[0]) updated.push(`${month}-${day}`); else skipped.push(`${month}-${day}`);
      }
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.life_cards.imported',
        resourceType: 'content_life_card',
        metadata: { updated: updated.length, skipped: skipped.length },
      }, client);
    });
    return { updated: updated.length, skipped: skipped.length, skippedKeys: skipped.slice(0, 20) };
  }

  @Patch('life-cards/manage/:month/:day')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateLifeCard(
    @Param('month') monthValue: string,
    @Param('day') dayValue: string,
    @Body() body: Record<string, unknown>,
    @Req() request: Request & { user?: { sub: string } },
  ) {
    const month = Number(monthValue);
    const day = Number(dayValue);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('生日月日无效');
    }
    const suit = String(body.suit ?? '');
    if (!lifeCardSuits.includes(suit as typeof lifeCardSuits[number])) throw new BadRequestException('花色无效');
    const rank = String(body.rank ?? '');
    if (!lifeCardRanks.includes(rank as typeof lifeCardRanks[number])) throw new BadRequestException('牌面点数无效');
    const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, lifeCardTextLimits.theme) : '';
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, lifeCardTextLimits.title) : '';
    const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, lifeCardTextLimits.summary) : '';
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, lifeCardTextLimits.prompt) : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, lifeCardTextLimits.note) : '';
    const sourceNote = typeof body.sourceNote === 'string' ? body.sourceNote.trim().slice(0, lifeCardTextLimits.sourceNote) : '';
    if (!title || !summary || !prompt) throw new BadRequestException('标题、说明与观察提示不能为空');
    return this.database.withTransaction(async (client) => {
      const updated = await client.query<LifeCardRow>(
        `update content_life_cards
            set suit = $3, rank = $4, theme = $5, title = $6, summary = $7, prompt = $8, note = $9, source_note = $10, updated_at = now(), updated_by = $11
          where month = $1 and day = $2
          returning month, day, suit, rank, theme, title, summary, prompt, note, source_note as "sourceNote"`,
        [month, day, suit, rank, theme, title, summary, prompt, note, sourceNote, request.user?.sub ?? null],
      );
      if (!updated.rows[0]) throw new NotFoundException('这一天的生命牌文案尚未初始化');
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.life_card.updated',
        resourceType: 'content_life_card',
        resourceId: `${month}-${day}`,
        metadata: { month, day, suit, rank },
      }, client);
      return updated.rows[0];
    });
  }

  @Get('daily-objects/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async manageDailyObjects() {
    const published = await this.readDailyObjectsContent();
    const draft = await this.database.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects'`);
    return draft.rows[0] ? { ...normalizeDailyObjectsContent(draft.rows[0].content, draft.rows[0].editVersion), draft: true } : { ...published, draft: false };
  }

  @Patch('daily-objects/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateDailyObjects(@Req() request: Request & { user?: { sub: string } }, @Body() body: DailyObjectsContentDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('日常之物版本无效，请重新读取');
    const ids = body.products.map((product) => product.id.trim());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('商品编号不能重复');
    const products = await Promise.all(body.products.map(async (product) => {
      const normalized = { ...product, id: product.id.trim(), name: product.name.trim(), english: product.english.trim(), image: product.image.trim(), price: product.price.trim(), priceLabel: product.priceLabel.trim(), description: product.description.trim(), optionDetails: product.optionDetails.trim(), dailyUseDetails: product.dailyUseDetails.trim(), deliveryDetails: product.deliveryDetails.trim() };
      if (!normalized.name || !normalized.english || !normalized.image || !normalized.description) throw new BadRequestException('商品名称、英文标识、图片路径和详情说明不能为空');
      if (normalized.image.startsWith('content/image/')) {
        let valid = false;
        try {
          valid = this.isManagedMediaObjectKey(normalized.image) && this.isAllowedMediaObject(normalized.image, await this.storage.objectMetadata(normalized.image));
        } catch {}
        if (!valid) throw new BadRequestException('商品图片对象不存在或格式无效');
      } else if (!normalized.image.startsWith('/assets/shop/') && !/^https:\/\/[^\s]+$/i.test(normalized.image)) throw new BadRequestException('商品图片请上传图片或使用商店素材路径 / HTTPS 地址');
      return normalized;
    }));
    const articleImage = body.articleImage.trim();
    if (articleImage.startsWith('content/image/')) {
      let valid = false;
      try {
        valid = this.isManagedMediaObjectKey(articleImage) && this.isAllowedMediaObject(articleImage, await this.storage.objectMetadata(articleImage));
      } catch {}
      if (!valid) throw new BadRequestException('日常文章配图对象不存在或格式无效');
    } else if (articleImage !== '' && !articleImage.startsWith('/assets/') && !/^https:\/\/[^\s]+$/i.test(articleImage)) {
      throw new BadRequestException('日常文章配图请上传图片或使用 /assets/ 素材路径 / HTTPS 地址');
    }
    const officialArticleUrl = body.officialArticleUrl.trim();
    if (officialArticleUrl !== '') {
      let valid = false;
      if (!/[\s<>]/.test(officialArticleUrl)) {
        try {
          const articleUrl = new URL(officialArticleUrl);
          valid = articleUrl.protocol === 'https:' && articleUrl.hostname === 'mp.weixin.qq.com' && /^\/s(?:\/|$)/i.test(articleUrl.pathname);
        } catch {}
      }
      if (!valid) throw new BadRequestException('公众号文章链接须为 mp.weixin.qq.com 的 HTTPS 文章链接');
    }
    const content = {
      brandName: body.brandName.trim(), brandSubtitle: body.brandSubtitle.trim(), bagLabel: body.bagLabel.trim(), bagCount: body.bagCount.trim(),
      eyebrow: body.eyebrow.trim(), title: body.title.trim(), intro: body.intro.trim(), previewNote: body.previewNote.trim(), supportLabel: body.supportLabel.trim(),
      landingTitle: body.landingTitle.trim(), landingIntro: body.landingIntro.trim(), landingStatus: body.landingStatus.trim(),
      herDaysTitle: body.herDaysTitle.trim(), herDaysEnglish: body.herDaysEnglish.trim(), articleLabel: body.articleLabel.trim(),
      articleTitle: body.articleTitle.trim(), articleExcerpt: body.articleExcerpt.trim(), articleImage, articleImageAlt: body.articleImageAlt.trim(),
      articleCaption: body.articleCaption.trim(), officialArticleUrl, officialArticleButton: body.officialArticleButton.trim(),
      everydayObjectsTitle: body.everydayObjectsTitle.trim(), everydayObjectsEnglish: body.everydayObjectsEnglish.trim(), everydayObjectsIntro: body.everydayObjectsIntro.trim(),
      products,
    };
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number; content: { products?: Array<{ id?: string }> } }>(`select edit_version as "editVersion", content from content_daily_objects where id = 1 for update`);
      if (!current.rows[0]) throw new NotFoundException('日常之物页面尚未初始化');
      const existingDraft = await client.query<{ content: { products?: Array<{ id?: string }> }; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects' for update`);
      const currentVersion = existingDraft.rows[0]?.editVersion ?? current.rows[0].editVersion;
      if (currentVersion !== body.editVersion) throw new ConflictException({ code: 'daily_objects_content_changed', message: '日常之物草稿已被其他管理员更新，请重新载入后再保存。' });
      const retainedProductIds = new Set(products.map((product) => product.id));
      if ((existingDraft.rows[0]?.content?.products ?? current.rows[0].content?.products ?? []).some((product) => typeof product.id === 'string' && !retainedProductIds.has(product.id))) {
        throw new BadRequestException('商品不能永久删除；请关闭“在商品页显示”进行下架。');
      }
      const nextVersion = currentVersion + 1;
      await client.query(
        `insert into admin_content_drafts (content_key, content, edit_version, updated_by)
         values ('daily-objects', $1::jsonb, $2, $3)
         on conflict (content_key) do update set content = excluded.content, edit_version = excluded.edit_version, updated_by = excluded.updated_by, updated_at = now()`,
        [JSON.stringify(content), nextVersion, request.user?.sub ?? null],
      );
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.daily_objects.draft_saved', resourceType: 'daily_objects_content', resourceId: 'daily-objects', metadata: { productCount: products.length, productIds: products.map((product) => product.id), enabledProducts: products.filter((product) => product.enabled).map((product) => product.id) } }, client);
      return { ...content, editVersion: nextVersion, draft: true };
    });
  }

  @Post('daily-objects/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishDailyObjects(@Req() request: Request & { user?: { sub: string } }) {
    return this.database.withTransaction(async (client) => {
      const draft = await client.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'daily-objects' for update`);
      if (!draft.rows[0]) throw new BadRequestException('当前没有待发布的日常之物草稿');
      const saved = await client.query(`update content_daily_objects set content = $1::jsonb, edit_version = edit_version + 1, updated_at = now() where id = 1 returning edit_version as "editVersion"`, [JSON.stringify(draft.rows[0].content)]);
      await client.query(`delete from admin_content_drafts where content_key = 'daily-objects'`);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.daily_objects.published', resourceType: 'daily_objects_content', resourceId: 'daily-objects', metadata: { sourceDraftVersion: draft.rows[0].editVersion } }, client);
      return { ...normalizeDailyObjectsContent(draft.rows[0].content, saved.rows[0]?.editVersion ?? draft.rows[0].editVersion + 1), draft: false };
    });
  }

  @Get('practice/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async managePractice() {
    const published = await this.readPracticeContent();
    const draft = await this.database.query<{ content: Record<string, unknown>; editVersion: number }>(`select content, edit_version as "editVersion" from admin_content_drafts where content_key = 'practice'`);
    if (!draft.rows[0]) return { ...published, draft: false };
    // Older saved drafts can predate newly added fields. Merge them over the published
    // shape and normalize nested copy so a partial legacy draft cannot break the workspace.
    const saved = draft.rows[0].content && typeof draft.rows[0].content === 'object' && !Array.isArray(draft.rows[0].content)
      ? draft.rows[0].content
      : {};
    const merged = { ...published, ...saved };
    return {
      ...merged,
      observationCopy: sanitizeObservationCopy({
        ...(published.observationCopy as Record<string, unknown>),
        ...(saved.observationCopy && typeof saved.observationCopy === 'object' && !Array.isArray(saved.observationCopy)
          ? saved.observationCopy as Record<string, unknown>
          : {}),
      }),
      sharedPracticeCopy: normalizeSharedPracticeCopy({
        ...(published.sharedPracticeCopy as Record<string, unknown>),
        ...(saved.sharedPracticeCopy && typeof saved.sharedPracticeCopy === 'object' && !Array.isArray(saved.sharedPracticeCopy)
          ? saved.sharedPracticeCopy as Record<string, unknown>
          : {}),
      }),
      footerCopy: sanitizePracticeFooterCopy({
        ...(published.footerCopy as Record<string, unknown>),
        ...(saved.footerCopy && typeof saved.footerCopy === 'object' && !Array.isArray(saved.footerCopy)
          ? saved.footerCopy as Record<string, unknown>
          : {}),
      }),
      editVersion: draft.rows[0].editVersion,
      draft: true,
    };
  }

  /** 读取某期的共同实践文案（未单独保存时回退到全局默认值）。 */
  @Get('practice-copy/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async readIssuePracticeCopy(@Query('issueCode') issueCode?: string) {
    const code = (issueCode ?? '').trim();
    if (!code || code.length > 64) throw new BadRequestException('期刊编号无效');
    return this.database.withTransaction(async (client) => {
      const issue = await client.query<{ id: string; label: string; theme: string }>(
        'select id, label, theme from content_issues where code = $1', [code],
      );
      const row = issue.rows[0];
      if (!row) throw new NotFoundException('未找到该期刊');
      const page = await client.query<{ sharedPracticeCopy: unknown }>('select shared_practice_copy as "sharedPracticeCopy" from content_practice_page limit 1');
      const stored = await client.query<{ copy: unknown; offlineActivitiesPublished: boolean; updatedAt: string }>(
        'select copy, offline_activities_published as "offlineActivitiesPublished", updated_at as "updatedAt" from content_issue_practice_copy where issue_id = $1', [row.id],
      );
      const globalCopy = (page.rows[0]?.sharedPracticeCopy ?? {}) as Record<string, unknown>;
      const issueCopy = (stored.rows[0]?.copy ?? null) as Record<string, unknown> | null;
      const copy = normalizeSharedPracticeCopy(issueCopy ? { ...globalCopy, ...issueCopy } : globalCopy);
      return {
        issueCode: code,
        issueLabel: row.label,
        issueTheme: row.theme,
        source: issueCopy ? 'issue' : 'global',
        updatedAt: stored.rows[0]?.updatedAt ?? null,
        offlineActivitiesPublished: stored.rows[0]?.offlineActivitiesPublished === true,
        copy,
      };
    });
  }

  /** 保存某期的共同实践文案（upsert）。 */
  @Put('practice-copy/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async saveIssuePracticeCopy(
    @Req() request: Request & { user?: { sub: string; role?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const code = String(body.issueCode ?? '').trim();
    if (!code || code.length > 64) throw new BadRequestException('期刊编号无效');
    if (body.offlineActivitiesPublished !== undefined && typeof body.offlineActivitiesPublished !== 'boolean') {
      throw new BadRequestException('线下活动发布状态无效');
    }
    const offlineActivitiesPublished = body.offlineActivitiesPublished === true;
    const copy = normalizeSharedPracticeCopy(body.copy);
    return this.database.withTransaction(async (client) => {
      const issue = await client.query<{ id: string }>('select id from content_issues where code = $1', [code]);
      const issueId = issue.rows[0]?.id;
      if (!issueId) throw new NotFoundException('未找到该期刊');
      await client.query(
        `insert into content_issue_practice_copy (issue_id, copy, offline_activities_published, updated_at, updated_by)
         values ($1, $2::jsonb, $3, now(), $4)
         on conflict (issue_id) do update set copy = excluded.copy,
           offline_activities_published = excluded.offline_activities_published,
           updated_at = now(), updated_by = excluded.updated_by`,
        [issueId, JSON.stringify(copy), offlineActivitiesPublished, request.user?.sub ?? null],
      );
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.issue_practice_copy.saved',
        resourceType: 'content_issue',
        resourceId: code,
        metadata: { issueCode: code, offlineActivitiesPublished },
      }, client);
      return { saved: true, issueCode: code, offlineActivitiesPublished, copy };
    });
  }

  /** 把某期文案复制到另一期（常用于换期时继承上一期结构）。 */
  @Post('practice-copy/manage/copy-from')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async copyIssuePracticeCopy(
    @Req() request: Request & { user?: { sub: string; role?: string } },
    @Body() body: Record<string, unknown>,
  ) {
    const fromCode = String(body.fromIssueCode ?? '').trim();
    const toCode = String(body.toIssueCode ?? '').trim();
    if (!fromCode || !toCode) throw new BadRequestException('需要源期刊与目标期刊');
    if (fromCode === toCode) throw new BadRequestException('源期刊与目标期刊不能相同');
    return this.database.withTransaction(async (client) => {
      const issues = await client.query<{ id: string; code: string }>(
        'select id, code from content_issues where code = any($1)', [[fromCode, toCode]],
      );
      const fromId = issues.rows.find((row) => row.code === fromCode)?.id;
      const toId = issues.rows.find((row) => row.code === toCode)?.id;
      if (!fromId || !toId) throw new NotFoundException('未找到该期刊');
      const page = await client.query<{ sharedPracticeCopy: unknown }>('select shared_practice_copy as "sharedPracticeCopy" from content_practice_page limit 1');
      const globalCopy = (page.rows[0]?.sharedPracticeCopy ?? {}) as Record<string, unknown>;
      const source = await client.query<{ copy: unknown }>('select copy from content_issue_practice_copy where issue_id = $1', [fromId]);
      const sourceCopy = (source.rows[0]?.copy ?? null) as Record<string, unknown> | null;
      const copy = normalizeSharedPracticeCopy(sourceCopy ? { ...globalCopy, ...sourceCopy } : globalCopy);
      await client.query(
        `insert into content_issue_practice_copy (issue_id, copy, updated_at, updated_by)
         values ($1, $2::jsonb, now(), $3)
         on conflict (issue_id) do update set copy = excluded.copy, updated_at = now(), updated_by = excluded.updated_by`,
        [toId, JSON.stringify(copy), request.user?.sub ?? null],
      );
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.issue_practice_copy.copied',
        resourceType: 'content_issue',
        resourceId: toCode,
        metadata: { fromIssueCode: fromCode, toIssueCode: toCode },
      }, client);
      return { copied: true, fromIssueCode: fromCode, toIssueCode: toCode, copy };
    });
  }

  @Patch('practice/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updatePracticeContent(@Req() request: Request & { user?: { sub: string; role?: string } }, @Body() body: PracticeContentDto, publishDraft = false) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) {
      throw new BadRequestException('实践页面版本无效，请刷新后台后重试');
    }
    const keys = body.entries.map((entry) => entry.key);
    if (new Set(keys).size !== keys.length || keys.length === 0) {
      throw new BadRequestException('目录标识不能重复，且至少要保留一个目录');
    }
    const title = body.title.trim();
    const intro = body.intro.trim();
    if (!title || !intro || body.entries.some((entry) => !entry.title.trim() || !entry.description.trim())) {
      throw new BadRequestException('标题、说明和入口文案不能为空');
    }
    const titleRichText = sanitizeMinePageRichText(body.titleRichText ?? title, 80, '实践页面标题');
    const normalizedTitle = plainTextFromRichText(titleRichText);
    if (!normalizedTitle || normalizedTitle.length > 80) throw new BadRequestException('实践页面标题需为有效文字');
    const introRichText = sanitizeMinePageRichText(body.introRichText ?? intro, 240, '实践页面说明');
    const normalizedIntro = plainTextFromRichText(introRichText);
    if (!normalizedIntro || normalizedIntro.length > 240) throw new BadRequestException('实践页面说明需为有效文字');
    const metaLeftRichText = sanitizeMinePageRichText(body.metaLeftRichText ?? '实践', 80, '实践页左侧页眉');
    const metaRightRichText = sanitizeMinePageRichText(body.metaRightRichText ?? '此刻归安', 80, '实践页右侧页眉');
    const observationCopy = sanitizeObservationCopy(body.observationCopy);
    const sharedPracticeCopy = normalizeSharedPracticeCopy(body.sharedPracticeCopy);
    const footerCopy = sanitizePracticeFooterCopy(body.footerCopy);
    const normalizedEntries = body.entries.map((entry) => {
      const contextRichText = sanitizeMinePageRichText(entry.contextRichText ?? '', 240, '实践目录情境文案');
      const titleRichText = sanitizeMinePageRichText(entry.titleRichText ?? entry.title, 80, '实践目录名称');
      const rawDescription = entry.descriptionRichText ?? entry.description;
      const descriptionRichText = sanitizeMinePageRichText(rawDescription, 240, '实践目录补充说明');
      const title = plainTextFromRichText(titleRichText);
      const description = plainTextFromRichText(descriptionRichText);
      if (!title || title.length > 80 || !description || description.length > 240) throw new BadRequestException('实践目录名称与补充说明需为有效文字');
      const target = entry.target && ['observation', 'shared-practice', 'daily-goods', 'none'].includes(entry.target) ? entry.target : entry.key;
      return {
        ...entry,
        target,
        title,
        description,
        contextRichText,
        contextFontSize: entry.contextFontSize ?? 12,
        contextColor: entry.contextColor ?? '#8b6b58',
        titleRichText,
        titleFontSize: entry.titleFontSize ?? 16,
        titleColor: entry.titleColor ?? '#40362f',
        descriptionRichText,
        descriptionFontSize: entry.descriptionFontSize ?? 13,
        descriptionColor: entry.descriptionColor ?? '#40362f',
      };
    });
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(
        `select edit_version as "editVersion" from content_practice_page where id = 1 for update`,
      );
      if (!current.rows[0]) throw new NotFoundException('实践页面内容尚未初始化');
      const currentDraft = request.user?.role
        ? await client.query<{ editVersion: number }>(`select edit_version as "editVersion" from admin_content_drafts where content_key = 'practice' for update`)
        : { rows: [] as Array<{ editVersion: number }> };
      const currentVersion = currentDraft.rows[0]?.editVersion ?? current.rows[0].editVersion;
      if (currentVersion !== body.editVersion) {
        throw new ConflictException({ code: 'practice_content_changed', message: '实践页面内容已被其他管理员更新，请重新载入后再保存。' });
      }
      const entries = normalizedEntries;
      // 目录允许新增 / 删除：这里不再拦截缺失的 key，下面按前端数组重写整张表。
      if (!publishDraft && request.user?.role) {
        const nextVersion = currentVersion + 1;
        const draftContent = {
          editVersion: nextVersion, title: normalizedTitle, titleRichText, titleFontSize: body.titleFontSize ?? 12, titleColor: body.titleColor ?? '#8b6b58',
          intro: normalizedIntro, introRichText, introFontSize: body.introFontSize ?? 32, introColor: body.introColor ?? '#40362f',
          metaLeftRichText, metaLeftFontSize: body.metaLeftFontSize ?? 12, metaLeftColor: body.metaLeftColor ?? '#8b6b58',
          metaRightRichText, metaRightFontSize: body.metaRightFontSize ?? 12, metaRightColor: body.metaRightColor ?? '#8b6b58',
          observationCopy, sharedPracticeCopy, footerCopy, entries,
        };
        await client.query(
          `insert into admin_content_drafts (content_key, content, edit_version, updated_by)
           values ('practice', $1::jsonb, $2, $3)
           on conflict (content_key) do update set content = excluded.content, edit_version = excluded.edit_version, updated_by = excluded.updated_by, updated_at = now()`,
          [JSON.stringify(draftContent), nextVersion, request.user?.sub ?? null],
        );
        await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.practice.draft_saved', resourceType: 'practice_content', resourceId: 'practice-page', metadata: { editVersion: nextVersion, entryKeys: entries.map((entry) => entry.key) } }, client);
        return { ...draftContent, draft: true };
      }
      const page = await client.query<{ title: string; titleRichText: string; titleFontSize: number; titleColor: string; intro: string; introRichText: string; introFontSize: number; introColor: string; metaLeftRichText: string; metaLeftFontSize: number; metaLeftColor: string; metaRightRichText: string; metaRightFontSize: number; metaRightColor: string; observationCopy: unknown; sharedPracticeCopy: unknown; footerCopy: unknown; editVersion: number }>(
        `update content_practice_page set title = $1, title_rich_text = $2, title_font_size = $3, title_color = $4,
           intro = $5, intro_rich_text = $6, intro_font_size = $7, intro_color = $8,
           meta_left_rich_text = $9, meta_left_font_size = $10, meta_left_color = $11,
           meta_right_rich_text = $12, meta_right_font_size = $13, meta_right_color = $14, observation_copy = $15::jsonb, shared_practice_copy = $16::jsonb, footer_copy = $17::jsonb,
           edit_version = edit_version + 1, updated_at = now()
         where id = 1 returning title, title_rich_text as "titleRichText", title_font_size as "titleFontSize", title_color as "titleColor", intro, intro_rich_text as "introRichText", intro_font_size as "introFontSize", intro_color as "introColor",
           meta_left_rich_text as "metaLeftRichText", meta_left_font_size as "metaLeftFontSize", meta_left_color as "metaLeftColor",
           meta_right_rich_text as "metaRightRichText", meta_right_font_size as "metaRightFontSize", meta_right_color as "metaRightColor", observation_copy as "observationCopy", shared_practice_copy as "sharedPracticeCopy", footer_copy as "footerCopy", edit_version as "editVersion"`,
        [normalizedTitle, titleRichText, body.titleFontSize ?? 12, body.titleColor ?? '#8b6b58', normalizedIntro, introRichText, body.introFontSize ?? 32, body.introColor ?? '#40362f', metaLeftRichText, body.metaLeftFontSize ?? 12, body.metaLeftColor ?? '#8b6b58', metaRightRichText, body.metaRightFontSize ?? 12, body.metaRightColor ?? '#8b6b58', JSON.stringify(observationCopy), JSON.stringify(sharedPracticeCopy), JSON.stringify(footerCopy)],
      );
      if (!page.rows[0]) throw new NotFoundException('实践页面内容尚未初始化');
      await client.query(`delete from content_practice_entries where key <> all($1::text[])`, [keys]);
      // Clear existing order collisions inside the migration's 0..1000 bound before reordering.
      await client.query(`update content_practice_entries set sort_order = 1000`);
      for (const [index, entry] of entries.entries()) {
        await client.query(
          `insert into content_practice_entries
             (key, target, title, description, enabled, sort_order, context_rich_text, context_font_size, context_color,
              title_rich_text, title_font_size, title_color, description_rich_text, description_font_size, description_color, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
           on conflict (key) do update set target = excluded.target, title = excluded.title, description = excluded.description,
             enabled = excluded.enabled, sort_order = excluded.sort_order, context_rich_text = excluded.context_rich_text,
             context_font_size = excluded.context_font_size, context_color = excluded.context_color,
             title_rich_text = excluded.title_rich_text, title_font_size = excluded.title_font_size, title_color = excluded.title_color,
             description_rich_text = excluded.description_rich_text, description_font_size = excluded.description_font_size,
             description_color = excluded.description_color, updated_at = now()`,
          [entry.key, entry.target, entry.title, entry.description, entry.enabled, index + 1, entry.contextRichText, entry.contextFontSize, entry.contextColor, entry.titleRichText, entry.titleFontSize, entry.titleColor, entry.descriptionRichText, entry.descriptionFontSize, entry.descriptionColor],
        );
      }
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.practice.updated',
        resourceType: 'practice_content',
        resourceId: 'practice-page',
        metadata: { fields: ['title', 'titleRichText', 'titleFontSize', 'titleColor', 'intro', 'introRichText', 'introFontSize', 'introColor', 'metaLeftRichText', 'metaLeftFontSize', 'metaLeftColor', 'metaRightRichText', 'metaRightFontSize', 'metaRightColor', 'observationCopy', 'sharedPracticeCopy', 'footerCopy'], entryKeys: entries.map((entry) => entry.key), entryCount: entries.length, entryFields: ['contextRichText', 'contextFontSize', 'contextColor', 'titleRichText', 'titleFontSize', 'titleColor', 'descriptionRichText', 'descriptionFontSize', 'descriptionColor'], enabledEntries: entries.filter((entry) => entry.enabled).map((entry) => entry.key) },
      }, client);
      await client.query(`delete from admin_content_drafts where content_key = 'practice'`);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.practice.published', resourceType: 'practice_content', resourceId: 'practice-page', metadata: { sourceDraftVersion: body.editVersion } }, client);
      return { ...page.rows[0], observationCopy: sanitizeObservationCopy(page.rows[0].observationCopy), sharedPracticeCopy: normalizeSharedPracticeCopy(page.rows[0].sharedPracticeCopy), footerCopy: sanitizePracticeFooterCopy(page.rows[0].footerCopy), entries };
    });
  }

  @Post('practice/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishPracticeDraft(@Req() request: Request & { user?: { sub: string } }) {
    const draft = await this.database.query<{ content: PracticeContentDto }>(`select content from admin_content_drafts where content_key = 'practice'`);
    if (!draft.rows[0]) throw new BadRequestException('当前没有待发布的实践页面草稿');
    return this.updatePracticeContent(request, draft.rows[0].content, true);
  }

  private async readPrivacyPageContent() {
    const result = await this.database.query<{ editVersion: number; copy: unknown }>(
      `select edit_version as "editVersion", copy from content_privacy_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('通知与隐私页面内容尚未初始化');
    return { editVersion: result.rows[0].editVersion, copy: sanitizePrivacyPageCopy(result.rows[0].copy) };
  }

  @Get('privacy')
  @Header('Cache-Control', 'no-store')
  privacyPage() {
    return this.readPrivacyPageContent();
  }

  private sanitizeAboutContent(raw: unknown) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const value = (key: 'brandIntro' | 'contentSources' | 'contactInfo', fallback: string) => {
      const text = source[key];
      return typeof text === 'string' && text.trim().length > 0 && text.length <= 6000 ? text.trim() : fallback;
    };
    return {
      brandIntro: value('brandIntro', 'MYRIAD SHE 是一个陪伴女性回到自身经验的观察与实践空间。'),
      contentSources: value('contentSources', '内容来自团队原创研究、实践设计与经授权引用的资料。'),
      contactInfo: value('contactInfo', '如需联系，请通过应用内客服渠道与我们联系。'),
    };
  }

  private async readAboutContent(draft = false) {
    const result = await this.database.query<{ editVersion: number; content: unknown; publishedVersion: number; publishedAt: Date }>(
      `select edit_version as "editVersion", ${draft ? 'draft' : 'published'} as content, published_version as "publishedVersion", published_at as "publishedAt"
       from content_about_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
    return { editVersion: result.rows[0].editVersion, ...this.sanitizeAboutContent(result.rows[0].content), publishedVersion: result.rows[0].publishedVersion, publishedAt: result.rows[0].publishedAt };
  }

  @Get('about')
  @Header('Cache-Control', 'no-store')
  about() { return this.readAboutContent(); }

  @Get('about/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  manageAbout() { return this.readAboutContent(true); }

  @Patch('about/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async saveAboutDraft(@Req() request: Request & { user?: { sub: string } }, @Body() body: AboutPageDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('关于页面版本无效，请刷新后台后重试');
    const content = this.sanitizeAboutContent(body);
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(`select edit_version as "editVersion" from content_about_page where id = 1 for update`);
      if (!current.rows[0]) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
      if (current.rows[0].editVersion !== body.editVersion) throw new ConflictException({ code: 'about_page_changed', message: '关于内容已被其他管理员更新，请重新载入后再保存。' });
      const saved = await client.query<{ editVersion: number; publishedVersion: number; publishedAt: Date }>(
        `update content_about_page set draft = $1::jsonb, edit_version = edit_version + 1, updated_at = now()
         where id = 1 returning edit_version as "editVersion", published_version as "publishedVersion", published_at as "publishedAt"`, [JSON.stringify(content)],
      );
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.about.draft_saved', resourceType: 'about_content', resourceId: 'about-page', metadata: { fields: Object.keys(content) } }, client);
      return { editVersion: saved.rows[0].editVersion, ...content, publishedVersion: saved.rows[0].publishedVersion, publishedAt: saved.rows[0].publishedAt };
    });
  }

  @Post('about/manage/publish')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async publishAbout(@Req() request: Request & { user?: { sub: string } }, @Body() body: { editVersion: number }) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('关于内容版本无效，请刷新后台后重试');
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{ editVersion: number; publishedVersion: number; draft: unknown }>(`select edit_version as "editVersion", published_version as "publishedVersion", draft from content_about_page where id = 1 for update`);
      const page = result.rows[0];
      if (!page) throw new NotFoundException('关于 MYRIAD SHE 内容尚未初始化');
      if (page.editVersion !== body.editVersion) throw new ConflictException({ code: 'about_page_changed', message: '关于内容草稿已被更新，请重新读取后再发布。' });
      const nextVersion = page.publishedVersion + 1;
      const content = this.sanitizeAboutContent(page.draft);
      await client.query(`update content_about_page set published = draft, published_version = $1, published_at = now(), updated_at = now() where id = 1`, [nextVersion]);
      await client.query(`insert into content_privacy_revisions (content_key, version, content, published_by) values ('about-page', $1, $2::jsonb, $3)`, [nextVersion, JSON.stringify(content), request.user?.sub ?? null]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.about.published', resourceType: 'about_content', resourceId: 'about-page', metadata: { version: nextVersion } }, client);
      return { ...content, publishedVersion: nextVersion, editVersion: page.editVersion };
    });
  }

  @Get('privacy-revisions/:contentKey')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async privacyContentRevisions(@Param('contentKey') contentKey: string) {
    if (!['about-page', 'privacy-policy', 'user-agreement'].includes(contentKey)) throw new BadRequestException('内容类型无效');
    const result = await this.database.query<{ version: number; content: unknown; publishedBy: string | null; publishedAt: Date }>(
      `select r.version, r.content, coalesce(a.display_name, r.published_by) as "publishedBy", r.published_at as "publishedAt"
       from content_privacy_revisions r
       left join admin_accounts a on a.id::text = r.published_by
       where r.content_key = $1 order by r.version desc limit 50`, [contentKey],
    );
    return result.rows;
  }

  private async readMinePageContent() {
    const result = await this.database.query<{ editVersion: number; title: string; intro: string; observationHeading: string; emptyTitle: string; emptyIntro: string; startButton: string; discussionHeading: string; discussionCount: string; discussionEmptyAction: string; discussionIntro: string; practiceHeading: string; practiceCount: string; practiceEmptyTitle: string; practiceIntro: string; privacyHeading: string; privacyAction: string }>(
      `select edit_version as "editVersion", title, intro, observation_heading as "observationHeading", empty_title as "emptyTitle", empty_intro as "emptyIntro", start_button as "startButton",
              discussion_heading as "discussionHeading", discussion_count as "discussionCount", discussion_empty_action as "discussionEmptyAction", discussion_intro as "discussionIntro",
              practice_heading as "practiceHeading", practice_count as "practiceCount", practice_empty_title as "practiceEmptyTitle", practice_intro as "practiceIntro",
              privacy_heading as "privacyHeading", privacy_action as "privacyAction"
       from content_mine_page where id = 1`,
    );
    if (!result.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
    return sanitizeMinePageContentFields(result.rows[0] as unknown as Record<string, unknown>);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  minePage() {
    return this.readMinePageContent();
  }

  @Get('mine/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  manageMinePage() {
    return this.readMinePageContent();
  }

  @Patch('mine/manage')
  @UseGuards(AdminAuthGuard)
  @Header('Cache-Control', 'no-store')
  async updateMinePageContent(@Req() request: Request & { user?: { sub: string } }, @Body() body: MinePageContentDto) {
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) {
      throw new BadRequestException('我的页面版本无效，请刷新后台后重试');
    }
    const content = sanitizeMinePageContentFields({
      title: body.title,
      intro: body.intro,
      observationHeading: body.observationHeading,
      emptyTitle: body.emptyTitle,
      emptyIntro: body.emptyIntro,
      startButton: body.startButton,
      discussionHeading: body.discussionHeading,
      discussionCount: body.discussionCount,
      discussionEmptyAction: body.discussionEmptyAction,
      discussionIntro: body.discussionIntro,
      practiceHeading: body.practiceHeading,
      practiceCount: body.practiceCount,
      practiceEmptyTitle: body.practiceEmptyTitle,
      practiceIntro: body.practiceIntro,
      privacyHeading: body.privacyHeading,
      privacyAction: body.privacyAction,
    });
    return this.database.withTransaction(async (client) => {
      const current = await client.query<{ editVersion: number }>(
        `select edit_version as "editVersion" from content_mine_page where id = 1 for update`,
      );
      if (!current.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
      if (current.rows[0].editVersion !== body.editVersion) {
        throw new ConflictException({ code: 'mine_page_content_changed', message: '我的页面文案已被其他管理员更新，请重新载入后再保存。' });
      }
      const updated = await client.query(
        `update content_mine_page
         set title = $1, intro = $2, observation_heading = $3, empty_title = $4, empty_intro = $5, start_button = $6,
             discussion_heading = $7, discussion_count = $8, discussion_empty_action = $9, discussion_intro = $10,
             practice_heading = $11, practice_count = $12, practice_empty_title = $13, practice_intro = $14,
             privacy_heading = $15, privacy_action = $16,
             edit_version = edit_version + 1, updated_at = now()
         where id = 1
         returning edit_version as "editVersion", title, intro, observation_heading as "observationHeading", empty_title as "emptyTitle", empty_intro as "emptyIntro", start_button as "startButton",
                   discussion_heading as "discussionHeading", discussion_count as "discussionCount", discussion_empty_action as "discussionEmptyAction", discussion_intro as "discussionIntro",
                   practice_heading as "practiceHeading", practice_count as "practiceCount", practice_empty_title as "practiceEmptyTitle", practice_intro as "practiceIntro",
                   privacy_heading as "privacyHeading", privacy_action as "privacyAction"`,
        [content.title, content.intro, content.observationHeading, content.emptyTitle, content.emptyIntro, content.startButton,
          content.discussionHeading, content.discussionCount, content.discussionEmptyAction, content.discussionIntro,
          content.practiceHeading, content.practiceCount, content.practiceEmptyTitle, content.practiceIntro, content.privacyHeading, content.privacyAction],
      );
      if (!updated.rows[0]) throw new NotFoundException('我的页面内容尚未初始化');
      await this.audit.record({
        actorType: 'admin',
        actorId: request.user?.sub,
        action: 'content.mine_page.updated',
        resourceType: 'mine_page_content',
        resourceId: 'mine-page',
        metadata: { fields: Object.keys(content) },
      }, client);
      return updated.rows[0];
    });
  }
}
