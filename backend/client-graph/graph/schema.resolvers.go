package graph

// This file will be automatically regenerated based on the schema, any resolver implementations
// will be copied through when generating and any unknown code will be moved to the end.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/highlight-run/highlight/backend/client-graph/graph/generated"
	customModels "github.com/highlight-run/highlight/backend/client-graph/graph/model"
	parse "github.com/highlight-run/highlight/backend/event-parse"
	"github.com/highlight-run/highlight/backend/model"
	e "github.com/pkg/errors"
	log "github.com/sirupsen/logrus"
	"github.com/slack-go/slack"
	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace/tracer"
	"gorm.io/gorm"
)

func (r *mutationResolver) InitializeSession(ctx context.Context, organizationVerboseID string, enableStrictPrivacy bool, clientVersion string, firstloadVersion string, clientConfig string) (*model.Session, error) {
	session, err := InitializeSessionImplementation(r, ctx, organizationVerboseID, enableStrictPrivacy, firstloadVersion, clientVersion, clientConfig)

	if err != nil {
		msg := slack.WebhookMessage{Text: fmt.
			Sprintf("Error in InitializeSession: %q\nOccurred for organization: %q", err, organizationVerboseID)}
		slack.PostWebhook("https://hooks.slack.com/services/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", &msg)
	}

	return session, err
}

func (r *mutationResolver) IdentifySession(ctx context.Context, sessionID int, userIdentifier string, userObject interface{}) (*int, error) {
	obj, ok := userObject.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("error converting userObject interface type")
	}

	userProperties := map[string]string{
		"identifier": userIdentifier,
	}
	for k, v := range obj {
		userProperties[k] = fmt.Sprintf("%v", v)
	}
	if err := r.AppendProperties(sessionID, userProperties, PropertyType.USER); err != nil {
		return nil, e.Wrap(err, "error adding set of properites to db")
	}

	session := &model.Session{}
	if err := r.DB.Where(&model.Session{Model: model.Model{ID: sessionID}}).First(&session).Error; err != nil {
		return nil, e.Wrap(err, "error querying session by sessionID")
	}

	// Check if there is a session created by this user.
	firstTime := &model.F
	if err := r.DB.Where(&model.Session{Identifier: userIdentifier, OrganizationID: session.OrganizationID}).Take(&model.Session{}).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			firstTime = &model.T
		} else {
			return nil, e.Wrap(err, "error querying session with past identifier")
		}
	}

	session.FirstTime = firstTime
	session.Identifier = userIdentifier

	if err := r.DB.Save(&session).Error; err != nil {
		return nil, e.Wrap(err, "failed to update session")
	}

	return &sessionID, nil
}

func (r *mutationResolver) AddTrackProperties(ctx context.Context, sessionID int, propertiesObject interface{}) (*int, error) {
	obj, ok := propertiesObject.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("error converting userObject interface type")
	}
	fields := map[string]string{}
	for k, v := range obj {
		fields[k] = fmt.Sprintf("%v", v)
	}
	err := r.AppendProperties(sessionID, fields, PropertyType.TRACK)
	if err != nil {
		return nil, e.Wrap(err, "error adding set of properites to db")
	}
	return &sessionID, nil
}

func (r *mutationResolver) AddSessionProperties(ctx context.Context, sessionID int, propertiesObject interface{}) (*int, error) {
	obj, ok := propertiesObject.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("error converting userObject interface type")
	}
	fields := map[string]string{}
	for k, v := range obj {
		fields[k] = fmt.Sprintf("%v", v)
	}
	err := r.AppendProperties(sessionID, fields, PropertyType.SESSION)
	if err != nil {
		return nil, e.Wrap(err, "error adding set of properites to db")
	}
	return &sessionID, nil
}

func (r *mutationResolver) PushPayload(ctx context.Context, sessionID int, events customModels.ReplayEventsInput, messages string, resources string, errors []*customModels.ErrorObjectInput) (*int, error) {
	querySessionSpan, _ := tracer.StartSpanFromContext(ctx, "client-graph.pushPayload", tracer.ResourceName("db.querySession"))
	querySessionSpan.SetTag("sessionID", sessionID)
	querySessionSpan.SetTag("messagesLength", len(messages))
	querySessionSpan.SetTag("resourcesLength", len(resources))
	querySessionSpan.SetTag("numberOfErrors", len(errors))
	querySessionSpan.SetTag("numberOfEvents", len(events.Events))
	sessionObj := &model.Session{}
	res := r.DB.Where(&model.Session{Model: model.Model{ID: sessionID}}).First(&sessionObj)
	if res.Error != nil {
		return nil, fmt.Errorf("error reading from session: %v", res.Error)
	}
	querySessionSpan.Finish()

	organizationID := sessionObj.OrganizationID
	parseEventsSpan, _ := tracer.StartSpanFromContext(ctx, "client-graph.pushPayload", tracer.ResourceName("go.parseEvents"))
	if evs := events.Events; len(evs) > 0 {
		// TODO: this isn't very performant, as marshaling the whole event obj to a string is expensive;
		// should fix at some point.
		eventBytes, err := json.Marshal(events)
		if err != nil {
			return nil, e.Wrap(err, "error marshaling events from schema interfaces")
		}
		parsedEvents, err := parse.EventsFromString(string(eventBytes))
		if err != nil {
			return nil, e.Wrap(err, "error parsing events from schema interfaces")
		}

		// If we see a snapshot event, attempt to inject CORS stylesheets.
		for _, e := range parsedEvents.Events {
			if e.Type == parse.FullSnapshot {
				d, err := parse.InjectStylesheets(e.Data)
				if err != nil {
					continue
				}
				e.Data = d
			}
		}

		// Re-format as a string to write to the db.
		b, err := json.Marshal(parsedEvents)
		if err != nil {
			return nil, e.Wrap(err, "error marshaling events from schema interfaces")
		}
		obj := &model.EventsObject{SessionID: sessionID, Events: string(b)}
		if err := r.DB.Create(obj).Error; err != nil {
			return nil, e.Wrap(err, "error creating events object")
		}
	}
	parseEventsSpan.Finish()

	// unmarshal messages
	unmarshalMessagesSpan, _ := tracer.StartSpanFromContext(ctx, "client-graph.pushPayload", tracer.ResourceName("go.unmarshal.messages"))
	messagesParsed := make(map[string][]interface{})
	if err := json.Unmarshal([]byte(messages), &messagesParsed); err != nil {
		return nil, fmt.Errorf("error decoding message data: %v", err)
	}
	if len(messagesParsed["messages"]) > 0 {
		obj := &model.MessagesObject{SessionID: sessionID, Messages: messages}
		if err := r.DB.Create(obj).Error; err != nil {
			return nil, e.Wrap(err, "error creating messages object")
		}
	}
	unmarshalMessagesSpan.Finish()

	// unmarshal resources
	unmarshalResourcesSpan, _ := tracer.StartSpanFromContext(ctx, "client-graph.pushPayload", tracer.ResourceName("go.unmarshal.resources"))
	resourcesParsed := make(map[string][]interface{})
	if err := json.Unmarshal([]byte(resources), &resourcesParsed); err != nil {
		return nil, fmt.Errorf("error decoding resource data: %v", err)
	}
	if len(resourcesParsed["resources"]) > 0 {
		obj := &model.ResourcesObject{SessionID: sessionID, Resources: resources}
		if err := r.DB.Create(obj).Error; err != nil {
			return nil, e.Wrap(err, "error creating resources object")
		}
	}
	unmarshalResourcesSpan.Finish()

	// increment daily error table
	if len(errors) > 0 {
		n := time.Now()
		dailyError := &model.DailyErrorCount{}
		currentDate := time.Date(n.UTC().Year(), n.UTC().Month(), n.UTC().Day(), 0, 0, 0, 0, time.UTC)
		if err := r.DB.Where(&model.DailyErrorCount{
			OrganizationID: organizationID,
			Date:           &currentDate,
		}).Attrs(&model.DailyErrorCount{
			Count: 0,
		}).FirstOrCreate(&dailyError).Error; err != nil {
			return nil, e.Wrap(err, "Error creating new daily error")
		}

		if err := r.DB.Exec("UPDATE daily_error_counts SET count = count + ? WHERE date = ? AND organization_id = ?", len(errors), currentDate, organizationID).Error; err != nil {
			return nil, e.Wrap(err, "Error incrementing error count in db")
		}
	}

	// put errors in db
	putErrorsToDBSpan, _ := tracer.StartSpanFromContext(ctx, "client-graph.pushPayload", tracer.ResourceName("db.errors"))
	for _, v := range errors {
		traceBytes, err := json.Marshal(v.Trace)
		if err != nil {
			log.Errorf("Error marshaling trace: %v", v.Trace)
			continue
		}
		traceString := string(traceBytes)

		errorToInsert := &model.ErrorObject{
			OrganizationID: organizationID,
			SessionID:      sessionID,
			Event:          v.Event,
			Type:           v.Type,
			URL:            v.URL,
			Source:         v.Source,
			LineNumber:     v.LineNumber,
			ColumnNumber:   v.ColumnNumber,
			OS:             sessionObj.OSName,
			Browser:        sessionObj.BrowserName,
			Trace:          &traceString,
			Timestamp:      v.Timestamp,
		}

		//create error fields array
		metaFields := []*model.ErrorField{}
		metaFields = append(metaFields, &model.ErrorField{OrganizationID: organizationID, Name: "browser", Value: sessionObj.BrowserName})
		metaFields = append(metaFields, &model.ErrorField{OrganizationID: organizationID, Name: "os_name", Value: sessionObj.OSName})
		metaFields = append(metaFields, &model.ErrorField{OrganizationID: organizationID, Name: "visited_url", Value: errorToInsert.URL})
		metaFields = append(metaFields, &model.ErrorField{OrganizationID: organizationID, Name: "event", Value: errorToInsert.Event})
		group, err := r.HandleErrorAndGroup(errorToInsert, v.Trace, metaFields)
		if err != nil {
			log.Errorf("Error updating error group: %v", errorToInsert)
			continue
		}

		// Send a slack message if we're not on localhost.
		if !strings.Contains(errorToInsert.URL, "localhost") {
			if err := r.SendSlackErrorMessage(group, organizationID, sessionID, sessionObj.Identifier, errorToInsert.URL); err != nil {
				log.Errorf("Error sending slack error message: %v", err)
				continue
			}
		}
		// TODO: We need to do a batch insert which is supported by the new gorm lib.
	}
	putErrorsToDBSpan.Finish()

	now := time.Now()
	if err := r.DB.Model(&model.Session{Model: model.Model{ID: sessionID}}).Updates(&model.Session{PayloadUpdatedAt: &now}).Error; err != nil {
		return nil, e.Wrap(err, "error updating session payload time")
	}
	return &sessionID, nil
}

func (r *queryResolver) Ignore(ctx context.Context, id int) (interface{}, error) {
	return nil, nil
}

// Mutation returns generated.MutationResolver implementation.
func (r *Resolver) Mutation() generated.MutationResolver { return &mutationResolver{r} }

// Query returns generated.QueryResolver implementation.
func (r *Resolver) Query() generated.QueryResolver { return &queryResolver{r} }

type mutationResolver struct{ *Resolver }
type queryResolver struct{ *Resolver }
