import Button from '@components/Button/Button/Button';
import InfoTooltip from '@components/InfoTooltip/InfoTooltip';
import Popover from '@components/Popover/Popover';
import TextHighlighter from '@components/TextHighlighter/TextHighlighter';
import Tooltip from '@components/Tooltip/Tooltip';
import { GetFieldTypesQuery } from '@graph/operations';
import { Exact, Field } from '@graph/schemas';
import SvgXIcon from '@icons/XIcon';
import { SharedSelectStyleProps } from '@pages/Sessions/SearchInputs/SearchInputUtil';
import { DateInput } from '@pages/Sessions/SessionsFeedV2/components/QueryBuilder/components/DateInput';
import { LengthInput } from '@pages/Sessions/SessionsFeedV2/components/QueryBuilder/components/LengthInput';
import { useParams } from '@util/react-router/useParams';
import { Checkbox } from 'antd';
import classNames from 'classnames';
import _ from 'lodash';
import moment from 'moment';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { components } from 'react-select';
import AsyncSelect from 'react-select/async';
import Creatable from 'react-select/creatable';
import { Styles } from 'react-select/src/styles';
import { OptionTypeBase } from 'react-select/src/types';
import { useToggle } from 'react-use';

import { useGetAppVersionsQuery } from '../../../../../graph/generated/hooks';
import styles from './QueryBuilder.module.scss';

export interface RuleProps {
    field: SelectOption | undefined;
    op: Operator | undefined;
    val: MultiselectOption | undefined;
}

interface SelectOption {
    kind: 'single';
    label: string;
    value: string;
}
interface MultiselectOption {
    kind: 'multi';
    options: readonly {
        label: string;
        value: string;
    }[];
}

type OnChangeInput = SelectOption | MultiselectOption | undefined;
type OnChange = (val: OnChangeInput) => void;
type LoadOptions = (input: string, callback: any) => Promise<any>;

interface RuleSettings {
    onChangeKey: OnChange;
    getKeyOptions: LoadOptions;
    onChangeOperator: OnChange;
    getOperatorOptions: LoadOptions;
    onChangeValue: OnChange;
    getValueOptions: LoadOptions;
    onRemove: () => void;
    readonly: boolean;
}

type PopoutType =
    | 'select'
    | 'multiselect'
    | 'creatable'
    | 'date_range'
    | 'range';
interface PopoutContentProps {
    type: PopoutType;
    value: OnChangeInput;
    onChange: OnChange;
    loadOptions: LoadOptions;
}

interface PopoutProps {
    disabled: boolean;
}

interface SetVisible {
    setVisible: (val: boolean) => void;
}

const TOOLTIP_MESSAGE =
    'This property was automatically collected by Highlight';

const styleProps: Styles<{ label: string; value: string }, false> = {
    ...SharedSelectStyleProps,
    option: (provided, { isFocused }) => ({
        ...provided,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        direction: 'ltr',
        textAlign: 'left',
        padding: '0 0 0 12px',
        marginRight: '12px',
        fontSize: '12px',
        color: 'var(--color-text-primary)',
        backgroundColor: isFocused ? 'var(--color-gray-200)' : 'none',
        '&:active': {
            backgroundColor: 'var(--color-gray-200)',
        },
    }),
    menuList: (provided) => ({
        ...provided,
        scrollbarWidth: 'none',
        padding: '0',
        '&::-webkit-scrollbar': {
            display: 'none',
        },
        maxHeight: '400px',
    }),
    control: (provided) => ({
        ...provided,
        border: '0',
        boxShadow: '0',
        fontSize: '12px',
        background: 'none',
        'border-radius': '0',
        'border-bottom': '1px solid var(--color-gray-300)',
        '&:hover': {
            'border-bottom': '1px solid var(--color-gray-300)',
        },
    }),
    valueContainer: (provided) => ({
        ...provided,
        padding: '8px 12px',
    }),
    noOptionsMessage: (provided) => ({
        ...provided,
        fontSize: '12px',
    }),
    loadingMessage: (provided) => ({
        ...provided,
        fontSize: '12px',
    }),
};

function useScroll<T extends HTMLElement>(): [() => void, React.RefObject<T>] {
    const ref = useRef<T>(null);
    const doScroll = useCallback(() => {
        ref?.current?.scrollIntoView({ inline: 'center' });
    }, []);

    return [doScroll, ref];
}

const OptionLabelName: React.FC = (props) => {
    const ref = useRef<HTMLDivElement>(null);

    const [className, setClassName] = useState<string>(styles.shadowContainer);

    const setScrollShadow = (target: any) => {
        const { scrollLeft, offsetWidth, scrollWidth } = target;
        const showRightShadow = scrollLeft + offsetWidth < scrollWidth;
        const showLeftShadow = scrollLeft > 0;
        setClassName(
            classNames(styles.shadowContainer, {
                [styles.shadowRight]: showRightShadow && !showLeftShadow,
                [styles.shadowLeft]: showLeftShadow && !showRightShadow,
                [styles.shadowBoth]: showLeftShadow && showRightShadow,
            })
        );
    };

    useEffect(() => {
        if (!!ref?.current) {
            setScrollShadow(ref.current);
            const onScroll = (ev: any) => {
                setScrollShadow(ev.target);
            };
            ref.current.removeEventListener('scroll', onScroll);
            ref.current.addEventListener('scroll', onScroll, { passive: true });
            return () => window.removeEventListener('scroll', onScroll);
        }
    }, [ref]);

    return (
        <div className={styles.shadowParent}>
            <div className={className} />
            <div className={styles.optionLabelName} ref={ref}>
                {props.children}
            </div>
        </div>
    );
};

const ScrolledTextHighlighter = ({
    searchWords,
    textToHighlight,
}: {
    searchWords: string[];
    textToHighlight: string;
}) => {
    const [memoText, setMemoText] = useState<string>(textToHighlight);
    if (!_.isEqual(memoText, textToHighlight)) {
        setMemoText(textToHighlight);
    }
    const [doScroll, ref] = useScroll();

    useEffect(() => {
        doScroll();
    }, [doScroll, textToHighlight]);

    const ScrolledMark = (props: any) => {
        if (props.highlightIndex === 0) {
            // Attach the ref to the first matching instance
            return (
                <mark className={styles.highlighterStyles} ref={ref}>
                    {props.children}
                </mark>
            );
        } else {
            return (
                <mark className={styles.highlighterStyles}>
                    {props.children}
                </mark>
            );
        }
    };

    return (
        <TextHighlighter
            highlightTag={ScrolledMark}
            searchWords={searchWords}
            textToHighlight={textToHighlight}
        />
    );
};
const getDateLabel = (value: string): string => {
    const split = value.split('_');
    const start = split[0];
    const end = split[1];
    const startStr = moment(start).format('MMM D');
    const endStr = moment(end).format('MMM D');
    return `${startStr} and ${endStr}`;
};

const getLengthLabel = (value: string): string => {
    const split = value.split('_');
    const start = Number(split[0]);
    const end = Number(split[1]);
    const ints = Number.isInteger(start) && Number.isInteger(end);
    return ints
        ? `${start} and ${end} minutes`
        : `${start * 60} and ${end * 60} seconds`;
};

const getProcessedLabel = (value: string): string => {
    if (value === 'false') {
        return 'Live';
    } else {
        return 'Completed';
    }
};

const getStateLabel = (value: string): string => {
    if (value === 'RESOLVED') {
        return 'Resolved';
    } else if (value === 'IGNORED') {
        return 'Ignored';
    } else {
        return 'Open';
    }
};

const getMultiselectOption = (props: any) => {
    const {
        label,
        value,
        isSelected,
        selectOption,
        data: { __isNew__: isNew },
        selectProps: { inputValue },
    } = props;

    return (
        <div>
            <components.Option {...props}>
                <div className={styles.optionLabelContainer}>
                    <Checkbox
                        className={styles.optionCheckbox}
                        checked={isSelected}
                        onChange={() => {
                            selectOption({
                                label: label,
                                value: value,
                                data: { fromCheckbox: true },
                            });
                        }}
                    ></Checkbox>

                    <OptionLabelName>
                        {isNew ? ( // Don't highlight user provided values (e.g. contains/matches input)
                            label
                        ) : (
                            <ScrolledTextHighlighter
                                searchWords={inputValue.split(' ')}
                                textToHighlight={label}
                            />
                        )}
                    </OptionLabelName>
                </div>
            </components.Option>
        </div>
    );
};

const getOption = (props: any) => {
    const {
        label,
        value,
        selectProps: { inputValue },
    } = props;
    const type = getType(value);
    const nameLabel = getNameLabel(label);
    const typeLabel = getTypeLabel(value);
    const tooltipMessage = TOOLTIP_MESSAGES[value];
    const searchWords = [inputValue];

    return (
        <div>
            <components.Option {...props}>
                <div className={styles.optionLabelContainer}>
                    {!!typeLabel && (
                        <div className={styles.labelTypeContainer}>
                            <div className={styles.optionLabelType}>
                                <TextHighlighter
                                    searchWords={searchWords}
                                    textToHighlight={typeLabel}
                                />
                            </div>
                        </div>
                    )}
                    <div className={styles.optionLabelName}>
                        <TextHighlighter
                            searchWords={searchWords}
                            textToHighlight={nameLabel}
                        />
                    </div>
                    {(!!tooltipMessage ||
                        type === 'session' ||
                        type === CUSTOM_TYPE ||
                        type === ERROR_TYPE ||
                        type === ERROR_FIELD_TYPE ||
                        value === 'user_identifier') && (
                        <InfoTooltip
                            title={tooltipMessage ?? TOOLTIP_MESSAGE}
                            size="medium"
                            hideArrow
                            placement="right"
                            className={styles.optionTooltip}
                        />
                    )}
                </div>
            </components.Option>
        </div>
    );
};

const PopoutContent = ({
    value,
    onChange,
    loadOptions,
    setVisible,
    type,
    ...props
}: PopoutContentProps & SetVisible & OptionTypeBase) => {
    switch (type) {
        case 'select':
            return (
                <AsyncSelect
                    autoFocus
                    openMenuOnFocus
                    value={value?.kind === 'single' ? value : null}
                    styles={styleProps}
                    loadOptions={loadOptions}
                    defaultOptions
                    menuIsOpen
                    controlShouldRenderValue={false}
                    hideSelectedOptions={false}
                    isClearable={false}
                    components={{
                        DropdownIndicator: () => null,
                        IndicatorSeparator: () => null,
                        Menu: (props) => {
                            return (
                                <components.MenuList
                                    className={styles.menuListContainer}
                                    maxHeight={400}
                                    {...props}
                                ></components.MenuList>
                            );
                        },
                        Option: getOption,
                    }}
                    noOptionsMessage={({ inputValue }) =>
                        `No results for "${inputValue}"`
                    }
                    onChange={(item) => {
                        onChange(
                            !!item ? { kind: 'single', ...item } : undefined
                        );
                        setVisible(false);
                    }}
                    {...props}
                />
            );
        case 'multiselect':
            const selected =
                (value?.kind === 'multi' ? value.options : null) ?? [];
            return (
                <AsyncSelect
                    autoFocus
                    openMenuOnFocus
                    isMulti
                    value={selected}
                    styles={styleProps}
                    loadOptions={(input, callback) => {
                        const selectedSet = new Set(
                            selected.map((s) => s.value)
                        );
                        return loadOptions(input, callback).then((results) => [
                            ...selected,
                            ...results.filter(
                                (r: any) => !selectedSet.has(r.value)
                            ),
                        ]);
                    }}
                    defaultOptions
                    menuIsOpen
                    controlShouldRenderValue={false}
                    hideSelectedOptions={false}
                    isClearable={false}
                    components={{
                        DropdownIndicator: () => null,
                        IndicatorSeparator: () => null,
                        Menu: (props) => {
                            return (
                                <components.MenuList
                                    className={styles.menuListContainer}
                                    maxHeight={400}
                                    {...props}
                                ></components.MenuList>
                            );
                        },
                        Option: getMultiselectOption,
                    }}
                    noOptionsMessage={({ inputValue }) =>
                        `No results for "${inputValue}"`
                    }
                    onChange={(item) => {
                        onChange(
                            !!item
                                ? {
                                      kind: 'multi',
                                      options: item as readonly {
                                          label: string;
                                          value: string;
                                      }[],
                                  }
                                : undefined
                        );
                        if (value === undefined) {
                            setVisible(false);
                        }
                    }}
                    {...props}
                />
            );
        case 'creatable':
            const created =
                (value?.kind === 'multi' ? value.options : null) ?? [];
            return (
                <Creatable
                    autoFocus
                    openMenuOnFocus
                    isMulti
                    value={created}
                    styles={styleProps}
                    options={created}
                    defaultOptions
                    menuIsOpen
                    controlShouldRenderValue={false}
                    hideSelectedOptions={false}
                    isClearable={false}
                    filterOption={() => true}
                    components={{
                        DropdownIndicator: () => null,
                        IndicatorSeparator: () => null,
                        Menu: (props) => {
                            return (
                                <components.MenuList
                                    className={styles.menuListContainer}
                                    maxHeight={400}
                                    {...props}
                                ></components.MenuList>
                            );
                        },
                        Option: getMultiselectOption,
                    }}
                    noOptionsMessage={() => null}
                    onChange={(item) => {
                        onChange(
                            !!item
                                ? {
                                      kind: 'multi',
                                      options: item as readonly {
                                          label: string;
                                          value: string;
                                      }[],
                                  }
                                : undefined
                        );
                        setVisible(false);
                    }}
                    formatCreateLabel={(label) => label}
                    createOptionPosition="first"
                    allowCreateWhileLoading={false}
                    {...props}
                />
            );
        case 'date_range':
            return (
                <DateInput
                    startDate={
                        value?.kind === 'multi'
                            ? new Date(value.options[0]?.value.split('_')[0])
                            : undefined
                    }
                    endDate={
                        value?.kind === 'multi'
                            ? new Date(value.options[0]?.value.split('_')[1])
                            : undefined
                    }
                    onChange={(start, end) => {
                        const startIso = moment(start).toISOString();
                        const endIso = moment(end).toISOString();
                        const value = `${startIso}_${endIso}`;

                        onChange({
                            kind: 'multi',
                            options: [
                                {
                                    label: getDateLabel(value),
                                    value: value,
                                },
                            ],
                        });
                        setVisible(false);
                    }}
                />
            );
        case 'range':
            return (
                <LengthInput
                    start={
                        value?.kind === 'multi'
                            ? Number(value.options[0]?.value.split('_')[0])
                            : 0
                    }
                    end={
                        value?.kind === 'multi'
                            ? Number(value.options[0]?.value.split('_')[1])
                            : 60
                    }
                    onChange={(start, end) => {
                        const value = `${start}_${end}`;

                        onChange({
                            kind: 'multi',
                            options: [
                                {
                                    label: getLengthLabel(value),
                                    value,
                                },
                            ],
                        });
                        setVisible(false);
                    }}
                />
            );
    }
};

const SelectPopout = ({
    value,
    disabled,
    ...props
}: PopoutProps & PopoutContentProps) => {
    // Visible by default if no value yet
    const [visible, setVisible] = useState(!value);
    const onSetVisible = (val: boolean) => {
        setVisible(val);
    };

    const invalid =
        value === undefined ||
        (value?.kind === 'multi' && value.options.length === 0);

    const tooltipMessage =
        (value?.kind === 'multi' &&
            value.options.map((o) => o.label).join(', ')) ||
        undefined;

    return (
        <Popover
            trigger="click"
            content={
                <PopoutContent
                    value={value}
                    setVisible={onSetVisible}
                    {...props}
                />
            }
            placement="bottomLeft"
            contentContainerClassName={styles.contentContainer}
            popoverClassName={styles.popoverContainer}
            onVisibleChange={(isVisible) => {
                setVisible(isVisible);
            }}
            visible={visible}
            destroyTooltipOnHide
        >
            <Tooltip
                title={tooltipMessage}
                mouseEnterDelay={1.5}
                overlayStyle={{ maxWidth: '50vw', fontSize: '12px' }}
            >
                <span>
                    <Button
                        trackingId={`SessionsQuerySelect`}
                        className={classNames(styles.ruleItem, {
                            [styles.invalid]: invalid && !visible,
                        })}
                        disabled={disabled}
                    >
                        {invalid && '--'}
                        {value?.kind === 'single' && getNameLabel(value.label)}
                        {value?.kind === 'multi' &&
                            value.options.length > 1 &&
                            `${value.options.length} selections`}
                        {value?.kind === 'multi' &&
                            value.options.length === 1 &&
                            value.options[0].label}
                    </Button>
                </span>
            </Tooltip>
        </Popover>
    );
};

const getPopoutType = (op: Operator | undefined): PopoutType => {
    switch (op) {
        case 'contains':
        case 'not_contains':
        case 'matches':
        case 'not_matches':
            return 'creatable';
        case 'between_date':
            return 'date_range';
        case 'between':
            return 'range';
        default:
            return 'multiselect';
    }
};

const QueryRule = ({
    rule,
    onChangeKey,
    getKeyOptions,
    onChangeOperator,
    getOperatorOptions,
    onChangeValue,
    getValueOptions,
    onRemove,
    readonly,
}: { rule: RuleProps } & RuleSettings) => {
    return (
        <div className={styles.ruleContainer}>
            <SelectPopout
                value={rule.field}
                onChange={onChangeKey}
                loadOptions={getKeyOptions}
                type="select"
                disabled={readonly}
            />
            <SelectPopout
                value={getOperator(rule.op, rule.val)}
                onChange={onChangeOperator}
                loadOptions={getOperatorOptions}
                type="select"
                disabled={readonly}
            />
            {!!rule.op && hasArguments(rule.op) && (
                <SelectPopout
                    value={rule.val}
                    onChange={onChangeValue}
                    loadOptions={getValueOptions}
                    type={getPopoutType(rule.op)}
                    disabled={readonly}
                />
            )}
            {!readonly && (
                <Button
                    trackingId="SessionsQueryRemoveRule"
                    className={classNames(styles.ruleItem, styles.removeRule)}
                    onClick={() => {
                        onRemove();
                    }}
                >
                    <SvgXIcon />
                </Button>
            )}
        </div>
    );
};

const hasArguments = (op: Operator): boolean =>
    !['exists', 'not_exists'].includes(op);

const isNegative = (op: Operator): boolean =>
    [
        'is_not',
        'not_contains',
        'not_exists',
        'not_between',
        'not_between_date',
        'not_matches',
    ].includes(op);

const LABEL_MAP_SINGLE: { [K in Operator]: string } = {
    is: 'is',
    is_not: 'is not',
    contains: 'contains',
    not_contains: 'does not contain',
    exists: 'exists',
    not_exists: 'does not exist',
    between: 'is between',
    not_between: 'is not between',
    between_date: 'is between',
    not_between_date: 'is not between',
    matches: 'matches',
    not_matches: 'does not match',
};

const LABEL_MAP_MULTI: { [K in Operator]: string } = {
    is: 'is any of',
    is_not: 'is not any of',
    contains: 'contains any of',
    not_contains: 'does not contain any of',
    exists: 'exists',
    not_exists: 'does not exist',
    between: 'is between',
    not_between: 'is not between',
    between_date: 'is between',
    not_between_date: 'is not between',
    matches: 'matches any of',
    not_matches: 'does not match any of',
};

const TOOLTIP_MESSAGES: { [K in string]: string } = {
    contains: 'Filters for results that contain the input term(s).',
    not_contains: 'Filters for results that do not contain the input term(s).',
    matches:
        'Filters for results which match the input regex(es). Uses Lucene regex syntax.',
    not_matches:
        'Filters for results which do not match the input regex(es). Uses Lucene regex syntax.',
    exists: 'Filters for results which have this field.',
    not_exists: 'Filters for results which do not have this field.',
};

const NEGATION_MAP: { [K in Operator]: Operator } = {
    is: 'is_not',
    is_not: 'is',
    contains: 'not_contains',
    not_contains: 'contains',
    exists: 'not_exists',
    not_exists: 'exists',
    between: 'not_between',
    not_between: 'between',
    between_date: 'not_between_date',
    not_between_date: 'between_date',
    matches: 'not_matches',
    not_matches: 'matches',
};

type Operator =
    | 'is'
    | 'is_not'
    | 'contains'
    | 'not_contains'
    | 'exists'
    | 'not_exists'
    | 'between'
    | 'not_between'
    | 'between_date'
    | 'not_between_date'
    | 'matches'
    | 'not_matches';

const OPERATORS: Operator[] = [
    'is',
    'is_not',
    'contains',
    'not_contains',
    'exists',
    'not_exists',
    'matches',
    'not_matches',
];

export const RANGE_OPERATORS: Operator[] = ['between', 'not_between'];

export const DATE_OPERATORS: Operator[] = ['between_date', 'not_between_date'];

const LABEL_MAP: { [key: string]: string } = {
    referrer: 'Referrer',
    os_name: 'Operating System',
    active_length: 'Length',
    app_version: 'App Version',
    browser_name: 'Browser',
    browser: 'Browser',
    'visited-url': 'Visited URL',
    visited_url: 'Visited URL',
    created_at: 'Date',
    device_id: 'Device ID',
    os_version: 'OS Version',
    browser_version: 'Browser Version',
    environment: 'Environment',
    processed: 'Status',
    viewed: 'Viewed',
    first_time: 'First Time',
    starred: 'Starred',
    identifier: 'Identifier',
    reload: 'Reloaded',
    state: 'State',
    event: 'Event',
    timestamp: 'Date',
};

const getOperator = (
    op: Operator | undefined,
    val: OnChangeInput
): SelectOption | undefined => {
    if (!op) {
        return undefined;
    }

    const label = (isSingle(val) ? LABEL_MAP_SINGLE : LABEL_MAP_MULTI)[op];
    return {
        kind: 'single',
        value: op,
        label,
    };
};

const isSingle = (val: OnChangeInput) =>
    !(val?.kind === 'multi' && val.options.length > 1);

export const CUSTOM_TYPE = 'custom';
export const ERROR_TYPE = 'error';
export const ERROR_FIELD_TYPE = 'error-field';

interface FieldOptions {
    operators?: Operator[];
    type?: string;
}

interface HasOptions {
    options?: FieldOptions;
}
export type CustomField = HasOptions & Pick<Field, 'type' | 'name'>;

export type QueryBuilderRule = string[];

export interface QueryBuilderState {
    isAnd: boolean;
    rules: QueryBuilderRule[];
}

export const getDefaultQuery = (): string =>
    JSON.stringify({
        isAnd: true,
        rules: getDefaultRules(),
    });

const getDefaultRules = (): QueryBuilderRule[] => {
    return [['custom_processed', 'is', 'true']];
};

export const serializeRules = (rules: RuleProps[]): QueryBuilderRule[] => {
    const ruleGroups = rules
        .map((rule) => {
            if (!rule.field || !rule.op || !rule.val) {
                return [];
            }

            return [
                rule.field.value,
                rule.op,
                ...rule.val.options.map((op) => {
                    return op.value;
                }),
            ];
        })
        .filter((ruleGroup) => !!ruleGroup && ruleGroup.length > 0);

    return ruleGroups;
};

const LABEL_FUNC_MAP: { [K in string]: (x: string) => string } = {
    custom_processed: getProcessedLabel,
    custom_created_at: getDateLabel,
    custom_active_length: getLengthLabel,
    error_state: getStateLabel,
    'error-field_timestamp': getDateLabel,
};

export const deserializeGroup = (
    fieldVal: string,
    opVal: string,
    vals: string[]
): RuleProps => {
    const labelFunc = LABEL_FUNC_MAP[fieldVal];
    return {
        field: {
            kind: 'single',
            label: getName(fieldVal),
            value: fieldVal,
        },
        op: opVal as Operator,
        val: {
            kind: 'multi',
            options: vals.map((val) => {
                return {
                    label: labelFunc ? labelFunc(val) : val,
                    value: val,
                };
            }),
        },
    };
};

const deserializeRules = (ruleGroups: any): RuleProps[] => {
    const rules = ruleGroups.map((group: any[]) => {
        const [field, op, ...vals] = group;
        return deserializeGroup(field, op, vals);
    });

    return rules;
};

const isComplete = (rule: RuleProps) =>
    rule.field !== undefined &&
    rule.op !== undefined &&
    (!hasArguments(rule.op) ||
        (rule.val !== undefined && rule.val.options.length !== 0));

const getNameLabel = (label: string) => LABEL_MAP[label] ?? label;

const getTypeLabel = (value: string) => {
    const type = getType(value);
    const mapped = type === CUSTOM_TYPE ? 'session' : type;
    if (!!mapped && ['track', 'user', 'session'].includes(mapped)) {
        return mapped;
    }
    return undefined;
};

const getType = (value: string) => {
    return value.split('_')[0];
};

const getName = (value: string) => {
    const [, ...rest] = value.split('_');
    return rest.join('_');
};

export const propertiesToRules = (
    properties: any[],
    type: string,
    op: string
): RuleProps[] => {
    const propsMap = new Map<string, any[]>();
    for (const prop of properties) {
        if (!propsMap.has(prop.name)) {
            propsMap.set(prop.name, []);
        }
        propsMap.get(prop.name)?.push(prop.value.split(':')[0]);
    }
    const rules: RuleProps[] = [];
    for (const [name, vals] of propsMap) {
        const key = `${type}_${name}`;
        if (key === 'user_contains') {
            if (op === 'is_not') {
                rules.push(
                    deserializeGroup(`user_identifier`, 'not_contains', vals)
                );
            } else {
                rules.push(
                    deserializeGroup(`user_identifier`, 'contains', vals)
                );
            }
        } else {
            rules.push(deserializeGroup(`${type}_${name}`, op, vals));
        }
    }
    return rules;
};

export type FetchFieldVariables =
    | Partial<
          Exact<{
              project_id: string;
              count: number;
              field_type: string;
              field_name: string;
              query: string;
          }>
      >
    | undefined;

interface QueryBuilderProps {
    setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
    customFields: CustomField[];
    fetchFields: (variables?: FetchFieldVariables) => Promise<string[]>;
    fieldData?: GetFieldTypesQuery;
    getQueryFromParams: (params: any) => QueryBuilderState;
    searchParams: any;
    setSearchParams: React.Dispatch<React.SetStateAction<any>>;
    readonly?: boolean;
}

const QueryBuilder = ({
    setSearchQuery,
    customFields,
    fetchFields,
    fieldData,
    getQueryFromParams,
    searchParams,
    setSearchParams,
    readonly,
}: QueryBuilderProps) => {
    const getCustomFieldOptions = useCallback(
        (field: SelectOption | undefined) => {
            if (!field) {
                return undefined;
            }

            const type = getType(field.value);
            if (![CUSTOM_TYPE, ERROR_TYPE, ERROR_FIELD_TYPE].includes(type)) {
                return undefined;
            }

            return customFields.find((f) => f.name === field.label)?.options;
        },
        [customFields]
    );

    const getDefaultOperator = (field: SelectOption | undefined) =>
        ((field && getCustomFieldOptions(field)?.operators) ?? OPERATORS)[0];

    const parseInner = useCallback(
        (field: SelectOption, op: Operator, value?: string): any => {
            if (
                [CUSTOM_TYPE, ERROR_TYPE, ERROR_FIELD_TYPE].includes(
                    getType(field.value)
                )
            ) {
                const name = field.label;
                const isKeyword = !(
                    getCustomFieldOptions(field)?.type !== 'text'
                );
                switch (op) {
                    case 'is':
                        return {
                            term: {
                                [`${name}${
                                    isKeyword ? '.keyword' : ''
                                }`]: value,
                            },
                        };
                    case 'contains':
                        return {
                            wildcard: {
                                [`${name}${
                                    isKeyword ? '.keyword' : ''
                                }`]: `*${value}*`,
                            },
                        };
                    case 'matches':
                        return {
                            regexp: {
                                [`${name}${
                                    isKeyword ? '.keyword' : ''
                                }`]: value,
                            },
                        };
                    case 'exists':
                        return { exists: { field: name } };
                    case 'between_date':
                        return {
                            range: {
                                [name]: {
                                    gte: value?.split('_')[0],
                                    lte: value?.split('_')[1],
                                },
                            },
                        };
                    case 'between':
                        return {
                            range: {
                                [name]: {
                                    gte:
                                        Number(value?.split('_')[0]) *
                                        60 *
                                        1000,
                                    ...(Number(value?.split('_')[1]) === 60
                                        ? null
                                        : {
                                              lte:
                                                  Number(value?.split('_')[1]) *
                                                  60 *
                                                  1000,
                                          }),
                                },
                            },
                        };
                }
            } else {
                const key = field.value;
                switch (op) {
                    case 'is':
                        return {
                            term: { 'fields.KeyValue': `${key}_${value}` },
                        };
                    case 'contains':
                        return {
                            wildcard: {
                                'fields.KeyValue': `${key}_*${value}*`,
                            },
                        };
                    case 'matches':
                        return {
                            regexp: {
                                'fields.KeyValue': `${key}_${value}`,
                            },
                        };
                    case 'exists':
                        return { term: { 'fields.Key': key } };
                }
            }
        },
        [getCustomFieldOptions]
    );

    const parseRuleImpl = useCallback(
        (
            field: SelectOption,
            op: Operator,
            multiValue: MultiselectOption
        ): any => {
            if (isNegative(op)) {
                return {
                    bool: {
                        must_not: {
                            ...parseRuleImpl(
                                field,
                                NEGATION_MAP[op],
                                multiValue
                            ),
                        },
                    },
                };
            } else if (hasArguments(op)) {
                return {
                    bool: {
                        should: multiValue.options.map(({ value }) =>
                            parseInner(field, op, value)
                        ),
                    },
                };
            } else {
                return parseInner(field, op);
            }
        },
        [parseInner]
    );

    const parseRule = useCallback(
        (rule: RuleProps): any => {
            const field = rule.field!;
            const multiValue = rule.val!;
            const op = rule.op!;

            return parseRuleImpl(field, op, multiValue);
        },
        [parseRuleImpl]
    );

    const parseGroup = useCallback(
        (isAnd: boolean, rules: RuleProps[]): any => {
            const errorObjectRules = rules.filter(
                (r) => getType(r.field!.value) === ERROR_FIELD_TYPE
            );
            if (errorObjectRules.length === 0) {
                return {
                    bool: {
                        [isAnd ? 'must' : 'should']: rules.map((rule) =>
                            parseRule(rule)
                        ),
                    },
                };
            } else {
                const standardRules = rules.filter(
                    (r) => getType(r.field!.value) !== ERROR_FIELD_TYPE
                );
                return {
                    bool: {
                        [isAnd ? 'must' : 'should']: [
                            {
                                bool: {
                                    [isAnd
                                        ? 'must'
                                        : 'should']: standardRules.map((rule) =>
                                        parseRule(rule)
                                    ),
                                },
                            },
                            {
                                has_child: {
                                    type: 'child',
                                    query: {
                                        bool: {
                                            [isAnd
                                                ? 'must'
                                                : 'should']: errorObjectRules.map(
                                                (rule) => parseRule(rule)
                                            ),
                                        },
                                    },
                                },
                            },
                        ],
                    },
                };
            }
        },
        [parseRule]
    );

    const { project_id } = useParams<{
        project_id: string;
    }>();

    const { data: appVersionData } = useGetAppVersionsQuery({
        variables: { project_id },
    });

    const [currentRule, setCurrentRule] = useState<RuleProps | undefined>();

    const [rules, setRulesImpl] = useState<RuleProps[]>([]);
    const setRules = (rules: RuleProps[]) => {
        setRulesImpl(rules);
    };
    const newRule = () => {
        setCurrentRule({
            field: undefined,
            op: undefined,
            val: undefined,
        });
        setCurrentStep(1);
    };
    const addRule = (rule: RuleProps) => {
        setRules([...rules, rule]);
        setCurrentRule(undefined);
    };
    const removeRule = (index: number) =>
        setRules(rules.filter((_, idx) => idx !== index));
    const updateRule = (index: number, newProps: any) => {
        setRules(
            rules.map((rule, idx) =>
                idx !== index ? rule : { ...rule, ...newProps }
            )
        );
    };

    const [isAnd, toggleIsAnd] = useToggle(true);

    const getKeyOptions = async (input: string) => {
        const results = customFields
            .concat(fieldData?.field_types ?? [])
            .map((ft) => ({
                label: ft.name,
                value: ft.type + '_' + ft.name,
            }))
            .filter((ft) =>
                (
                    getTypeLabel(ft.value)?.toLowerCase() +
                    ':' +
                    getNameLabel(ft.label).toLowerCase()
                ).includes(input.toLowerCase())
            )
            .sort((a, b) => {
                const aLower = getNameLabel(a.label).toLowerCase();
                const bLower = getNameLabel(b.label).toLowerCase();
                if (aLower < bLower) {
                    return -1;
                } else if (aLower === bLower) {
                    return 0;
                } else {
                    return 1;
                }
            });
        return results;
    };

    const getOperatorOptionsCallback = (
        options: FieldOptions | undefined,
        val: OnChangeInput
    ) => {
        return async (input: string) => {
            return (options?.operators ?? OPERATORS)
                .map((op) => getOperator(op, val))
                .filter((op) =>
                    op?.label.toLowerCase().includes(input.toLowerCase())
                );
        };
    };

    const getValueOptionsCallback = (field: SelectOption | undefined) => {
        return async (input: string) => {
            if (field === undefined) {
                return;
            }

            let options: { label: string; value: string }[] = [];
            if (field.value === 'custom_app_version') {
                options =
                    appVersionData?.app_version_suggestion
                        .filter((val) => !!val)
                        .map((val) => ({
                            label: val as string,
                            value: val as string,
                        })) ?? [];
            } else if (field.value === 'custom_processed') {
                options = ['true', 'false'].map((v) => ({
                    label: getProcessedLabel(v),
                    value: v,
                }));
            } else if (field.value === 'error_state') {
                options = ['OPEN', 'RESOLVED', 'IGNORED'].map((v) => ({
                    label: getStateLabel(v),
                    value: v,
                }));
            } else if (field.value === 'error_Type') {
                options = [
                    'Backend',
                    'console.error',
                    'window.onerror',
                    'custom',
                ].map((v) => ({
                    label: v,
                    value: v,
                }));
            } else if (getCustomFieldOptions(field)?.type === 'boolean') {
                options = ['true', 'false'].map((v) => ({
                    label: v,
                    value: v,
                }));
            }

            if (options.length > 0) {
                return options.filter((opt) =>
                    opt.label?.toLowerCase().includes(input.toLowerCase())
                );
            }

            let label = field.label;
            if (field.value === 'error_Event') {
                label = 'event';
            }

            return await fetchFields({
                project_id,
                count: 10,
                field_type: getType(field.value),
                field_name: label,
                query: input,
            }).then((res) => {
                return res.map((val) => ({
                    label: val,
                    value: val,
                }));
            });
        };
    };

    // Track the current state of the query builder to detect changes
    const [qbState, setQbState] = useState<string | undefined>(undefined);

    // If the search query is updated externally, set the rules and `isAnd` toggle based on it
    useEffect(() => {
        if (!!searchParams.query && searchParams.query !== qbState) {
            const newState = JSON.parse(searchParams.query);
            toggleIsAnd(newState.isAnd);
            setRules(deserializeRules(newState.rules));
        }
    }, [searchParams.query, toggleIsAnd, qbState]);

    useEffect(() => {
        // Only update the external state if not readonly
        if (readonly) {
            return;
        }

        // If search params are updated and no query exists,
        // build it from the other params for backwards compatibility.
        if (searchParams.query === undefined) {
            const newState = getQueryFromParams(searchParams);
            const newQuery = JSON.stringify(newState);
            setSearchParams({
                query: newQuery,
            });
            return;
        }

        const allComplete = rules.every(isComplete);

        if (!allComplete) {
            return;
        }

        const query = parseGroup(isAnd, rules);
        setSearchQuery(JSON.stringify(query));
        const newState = JSON.stringify({
            isAnd,
            rules: serializeRules(rules),
        });

        // Update if the state has changed
        if (newState !== qbState) {
            setQbState(newState);
            setSearchParams((params: any) => ({
                ...params,
                query: newState,
            }));
        }
    }, [
        getQueryFromParams,
        isAnd,
        parseGroup,
        qbState,
        rules,
        searchParams,
        setSearchParams,
        setSearchQuery,
        readonly,
    ]);

    const [currentStep, setCurrentStep] = useState<number | undefined>(
        undefined
    );

    // Don't render anything if this is a readonly query builder and there are no rules
    if (readonly && rules.length === 0) {
        return null;
    }

    return (
        <div className={styles.builderContainer}>
            {rules.length > 0 && (
                <div className={styles.rulesContainer}>
                    {rules.flatMap((rule, index) => [
                        ...(index != 0
                            ? [
                                  <Button
                                      className={styles.separator}
                                      trackingId="SessionsQuerySeparatorToggle"
                                      onClick={toggleIsAnd}
                                      key={`separator-${index}`}
                                      type="dashed"
                                      disabled={readonly}
                                  >
                                      {isAnd ? 'and' : 'or'}
                                  </Button>,
                              ]
                            : []),
                        <QueryRule
                            key={`rule-${index}`}
                            rule={rule}
                            onChangeKey={(val) => {
                                // Default to 'is' when rule is not defined yet
                                if (rule.op === undefined) {
                                    updateRule(index, {
                                        field: val,
                                        op: getDefaultOperator(rule.field),
                                    });
                                } else {
                                    updateRule(index, { field: val });
                                }
                            }}
                            getKeyOptions={getKeyOptions}
                            onChangeOperator={(val) => {
                                if (val?.kind === 'single') {
                                    updateRule(index, { op: val.value });
                                }
                            }}
                            getOperatorOptions={getOperatorOptionsCallback(
                                getCustomFieldOptions(rule.field),
                                rule.val
                            )}
                            onChangeValue={(val) => {
                                updateRule(index, { val: val });
                            }}
                            getValueOptions={getValueOptionsCallback(
                                rule.field
                            )}
                            onRemove={() => removeRule(index)}
                            readonly={readonly ?? false}
                        />,
                    ])}
                </div>
            )}
            {!readonly && (
                <div>
                    <Popover
                        trigger="click"
                        content={
                            currentRule?.field === undefined ? (
                                <PopoutContent
                                    key={'popover-step-1'}
                                    value={undefined}
                                    setVisible={() => {
                                        setCurrentStep(undefined);
                                    }}
                                    onChange={(val) => {
                                        const field = val as
                                            | SelectOption
                                            | undefined;
                                        addRule({
                                            field: field,
                                            op: undefined,
                                            val: undefined,
                                        });
                                    }}
                                    loadOptions={getKeyOptions}
                                    type="select"
                                    placeholder="Filter..."
                                />
                            ) : currentRule?.op === undefined ? (
                                <PopoutContent
                                    key={'popover-step-2'}
                                    value={undefined}
                                    setVisible={() => {
                                        setCurrentStep(3);
                                    }}
                                    onChange={(val) => {
                                        const op = (val as SelectOption)
                                            .value as Operator;
                                        if (!hasArguments(op)) {
                                            setCurrentStep(undefined);
                                            addRule({
                                                ...currentRule,
                                                op,
                                            });
                                        } else {
                                            setCurrentRule({
                                                ...currentRule,
                                                op,
                                            });
                                        }
                                    }}
                                    loadOptions={getOperatorOptionsCallback(
                                        getCustomFieldOptions(
                                            currentRule.field
                                        ),
                                        currentRule.val
                                    )}
                                    type="select"
                                    placeholder="Select..."
                                />
                            ) : (
                                <PopoutContent
                                    key={'popover-step-3'}
                                    value={undefined}
                                    setVisible={() => {
                                        setCurrentStep(undefined);
                                    }}
                                    onChange={(val) => {
                                        addRule({
                                            ...currentRule,
                                            val: val as
                                                | MultiselectOption
                                                | undefined,
                                        });
                                    }}
                                    loadOptions={getValueOptionsCallback(
                                        currentRule.field
                                    )}
                                    type={getPopoutType(currentRule.op)}
                                    placeholder={`Select...`}
                                />
                            )
                        }
                        placement="bottomLeft"
                        contentContainerClassName={styles.contentContainer}
                        popoverClassName={styles.popoverContainer}
                        destroyTooltipOnHide
                        onVisibleChange={(isVisible) => {
                            if (!isVisible) {
                                setCurrentStep(undefined);
                            }
                        }}
                        visible={
                            currentStep === 1 ||
                            (currentStep === 2 && !!currentRule?.field) ||
                            (currentStep === 3 && !!currentRule?.op)
                        }
                    >
                        <Button
                            className={styles.addFilter}
                            trackingId="SessionsQueryAddRule2"
                            onClick={newRule}
                            type="dashed"
                        >
                            + Filter
                        </Button>
                    </Popover>
                </div>
            )}
        </div>
    );
};

export default QueryBuilder;