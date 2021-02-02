import React, { useState } from 'react';
import { auth } from '../../util/auth';
import { client } from '../../util/graph';
import { useParams, Redirect } from 'react-router-dom';

import styles from './NewMemberPage.module.scss';
import commonStyles from '../../Common.module.scss';
import { CircularSpinner, Spinner } from '../../components/Spinner/Spinner';
import {
    useAddAdminToOrganizationMutation,
    useGetAdminQuery,
} from '../../graph/generated/hooks';

export const NewMemberPage = () => {
    const { invite_id, organization_id } = useParams<{
        organization_id: string;
        invite_id: string;
    }>();
    const [adminAdded, setAdminAdded] = useState(false);
    const [
        addAdmin,
        { loading: addLoading },
    ] = useAddAdminToOrganizationMutation();
    const { loading: adminLoading, data: adminData } = useGetAdminQuery();
    if (adminAdded) {
        return <Redirect to={`/${organization_id}/setup`} />;
    }
    if (adminLoading) {
        return <Spinner />;
    }

    return (
        <div className={styles.boxWrapper}>
            <div className={styles.box}>
                <div className={styles.title}>Accept workspace invite?</div>
                <div className={styles.subTitle}>
                    Would you like to enter this workspace as '
                    {adminData?.admin?.email}' ?
                </div>
                <button
                    className={commonStyles.submitButton}
                    onClick={() => {
                        addAdmin({
                            variables: {
                                organization_id: organization_id,
                                invite_id,
                            },
                        }).then(() => {
                            setAdminAdded(true);
                        });
                    }}
                >
                    {addLoading ? (
                        <CircularSpinner
                            style={{ fontSize: 18, color: 'white' }}
                        />
                    ) : (
                        'Enter Workspace'
                    )}
                </button>
                <button
                    className={commonStyles.secondaryButton}
                    style={{ marginTop: 16 }}
                    onClick={() => {
                        auth.signOut();
                        client.cache.reset();
                    }}
                >
                    Login as different User
                </button>
            </div>
        </div>
    );
};
