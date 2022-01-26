export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  Any: any;
  Int64: any;
  Timestamp: any;
};

export type BackendErrorObjectInput = {
  event: Scalars['String'];
  payload?: InputMaybe<Scalars['String']>;
  request_id: Scalars['String'];
  session_secure_id: Scalars['String'];
  source: Scalars['String'];
  stackTrace: Scalars['String'];
  timestamp: Scalars['Timestamp'];
  type: Scalars['String'];
  url: Scalars['String'];
};

export type DeviceMetricInput = {
  name: Scalars['String'];
  value: Scalars['Float'];
};

export type ErrorObjectInput = {
  columnNumber: Scalars['Int'];
  event: Scalars['String'];
  lineNumber: Scalars['Int'];
  payload?: InputMaybe<Scalars['String']>;
  source: Scalars['String'];
  stackTrace: Array<InputMaybe<StackFrameInput>>;
  timestamp: Scalars['Timestamp'];
  type: Scalars['String'];
  url: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addDeviceMetric: Scalars['ID'];
  addSessionFeedback: Scalars['ID'];
  addSessionProperties?: Maybe<Scalars['ID']>;
  addTrackProperties?: Maybe<Scalars['ID']>;
  addWebVitals: Scalars['ID'];
  identifySession?: Maybe<Scalars['ID']>;
  initializeSession?: Maybe<Session>;
  pushBackendPayload?: Maybe<Scalars['Any']>;
  pushPayload?: Maybe<Scalars['ID']>;
};


export type MutationAddDeviceMetricArgs = {
  metric: DeviceMetricInput;
  session_id: Scalars['ID'];
};


export type MutationAddSessionFeedbackArgs = {
  session_id: Scalars['ID'];
  timestamp: Scalars['Timestamp'];
  user_email?: InputMaybe<Scalars['String']>;
  user_name?: InputMaybe<Scalars['String']>;
  verbatim: Scalars['String'];
};


export type MutationAddSessionPropertiesArgs = {
  properties_object?: InputMaybe<Scalars['Any']>;
  session_id: Scalars['ID'];
};


export type MutationAddTrackPropertiesArgs = {
  properties_object?: InputMaybe<Scalars['Any']>;
  session_id: Scalars['ID'];
};


export type MutationAddWebVitalsArgs = {
  metric: WebVitalMetricInput;
  session_id: Scalars['ID'];
};


export type MutationIdentifySessionArgs = {
  session_id: Scalars['ID'];
  user_identifier: Scalars['String'];
  user_object?: InputMaybe<Scalars['Any']>;
};


export type MutationInitializeSessionArgs = {
  appVersion?: InputMaybe<Scalars['String']>;
  clientConfig: Scalars['String'];
  clientVersion: Scalars['String'];
  enable_recording_network_contents: Scalars['Boolean'];
  enable_strict_privacy: Scalars['Boolean'];
  environment: Scalars['String'];
  fingerprint: Scalars['String'];
  firstloadVersion: Scalars['String'];
  organization_verbose_id: Scalars['String'];
};


export type MutationPushBackendPayloadArgs = {
  errors: Array<InputMaybe<BackendErrorObjectInput>>;
};


export type MutationPushPayloadArgs = {
  errors: Array<InputMaybe<ErrorObjectInput>>;
  events: ReplayEventsInput;
  is_beacon?: InputMaybe<Scalars['Boolean']>;
  messages: Scalars['String'];
  resources: Scalars['String'];
  session_id: Scalars['ID'];
};

export type Query = {
  __typename?: 'Query';
  ignore?: Maybe<Scalars['Any']>;
};


export type QueryIgnoreArgs = {
  id: Scalars['ID'];
};

export type ReplayEventsInput = {
  events: Array<InputMaybe<Scalars['Any']>>;
};

export type Session = {
  __typename?: 'Session';
  id: Scalars['ID'];
  organization_id: Scalars['ID'];
  project_id: Scalars['ID'];
  secure_id: Scalars['String'];
};

export type StackFrameInput = {
  args?: InputMaybe<Array<InputMaybe<Scalars['Any']>>>;
  columnNumber?: InputMaybe<Scalars['Int']>;
  fileName?: InputMaybe<Scalars['String']>;
  functionName?: InputMaybe<Scalars['String']>;
  isEval?: InputMaybe<Scalars['Boolean']>;
  isNative?: InputMaybe<Scalars['Boolean']>;
  lineNumber?: InputMaybe<Scalars['Int']>;
  source?: InputMaybe<Scalars['String']>;
};

export type WebVitalMetricInput = {
  name: Scalars['String'];
  value: Scalars['Float'];
};
