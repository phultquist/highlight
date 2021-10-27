import { usePlayerUIContext } from '@pages/Player/context/PlayerUIContext';
import { message } from 'antd';
import classNames from 'classnames';
import React from 'react';

import GoToButton from '../../../../../../../components/Button/GoToButton';
import TextHighlighter from '../../../../../../../components/TextHighlighter/TextHighlighter';
import { ErrorObject } from '../../../../../../../graph/generated/schemas';
import { MillisToMinutesAndSeconds } from '../../../../../../../util/time';
import { useReplayerContext } from '../../../../../ReplayerContext';
import styles from './ErrorCard.module.scss';

export enum ErrorCardState {
    Unknown,
    Active,
    Inactive,
}
interface Props {
    error: ErrorObject;
    state: ErrorCardState;
    setSelectedError: () => void;
    searchQuery: string;
}

const ErrorCard = ({ error, setSelectedError, searchQuery, state }: Props) => {
    const { replayer, setTime } = useReplayerContext();
    const { detailedPanel } = usePlayerUIContext();

    return (
        <button
            key={error.id}
            className={classNames(styles.errorCard, {
                [styles.active]: detailedPanel?.error?.id === error.id,
            })}
            onClick={setSelectedError}
        >
            <div
                className={styles.currentIndicatorWrapper}
                style={{
                    visibility:
                        state === ErrorCardState.Active ? 'visible' : 'hidden',
                }}
            >
                <div className={styles.currentIndicator} />
            </div>
            <div>
                <div className={styles.header}>
                    <h4>{error.type}</h4>
                    <p>
                        <TextHighlighter
                            searchWords={[searchQuery]}
                            textToHighlight={error.source || ''}
                        />
                        {error.structured_stack_trace[0] &&
                            ` at line ${error.structured_stack_trace[0].lineNumber}:${error.structured_stack_trace[0].columnNumber}`}
                    </p>
                </div>
                <div>
                    <p className={styles.description}>
                        <TextHighlighter
                            searchWords={[searchQuery]}
                            textToHighlight={getErrorDescription(error)}
                        />
                    </p>
                </div>
            </div>
            <div className={styles.actions}>
                {error.timestamp && (
                    <GoToButton
                        className={styles.goToButton}
                        onClick={(e) => {
                            e.stopPropagation();

                            const dateTimeErrorCreated = new Date(
                                error.timestamp
                            );
                            const startTime = replayer?.getMetaData().startTime;
                            if (startTime) {
                                const dateTimeSessionStart = new Date(
                                    startTime
                                );
                                const deltaMilliseconds =
                                    dateTimeErrorCreated.getTime() -
                                    dateTimeSessionStart.getTime();
                                setTime(deltaMilliseconds);

                                message.success(
                                    `Changed player time to when error was thrown at ${MillisToMinutesAndSeconds(
                                        deltaMilliseconds
                                    )}.`
                                );
                            }
                        }}
                        label="Goto"
                    />
                )}
            </div>
        </button>
    );
};

export default ErrorCard;

const getErrorDescription = (errorObject: ErrorObject): string => {
    const parsedEvent = errorObject.event;
    if (!parsedEvent) {
        return '';
    }
    return (parsedEvent[0] as string) ?? '';
};
