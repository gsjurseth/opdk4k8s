FROM centos:7.4.1708
ARG user
ARG pass
RUN yum -y install wget curl iproute \
    && groupadd -r apigee \
    && useradd -r -g apigee -d /opt/apigee -s /sbin/nologin -c "Apigee platform user" apigee \
    && wget https://dl.fedoraproject.org/pub/epel/epel-release-latest-7.noarch.rpm \
    && rpm -ivh epel-release-latest-7.noarch.rpm \
    && yum -y install yum-utils \
    && yum -y install yum-plugin-priorities \
    && yum -y install java-1.8.0-openjdk-devel bind-utils sudo \
    && curl https://software.apigee.com/bootstrap_4.18.05.sh -o /tmp/bootstrap_4.18.05.sh \
    && JAVA_HOME=/usr/lib/jvm/java-1.8.0 bash /tmp/bootstrap_4.18.05.sh apigeeuser=$user apigeepassword=$pass \
    && JAVA_HOME=/usr/lib/jvm/java-1.8.0 /opt/apigee/apigee-service/bin/apigee-service apigee-setup install \
    && echo 'export PATH=$PATH:/opt/apigee/apigee-cassandra/bin:/opt/apigee/apigee-service/bin:/opt/apigee/apigee-zookeeper/bin' >> /etc/profile \
    && echo 'apigee ALL=(ALL) NOPASSWD: ALL' >> /etc/sudoers \
    && cp /etc/profile /opt/apigee/.bashrc \
    && chown apigee:apigee /opt/apigee/.bashrc \
    && echo 'export PS1="\u@\h \w> "' >> /opt/apigee/.bashrc \
    && chmod 775 /opt/apigee/.bashrc \
    && JRE_DIR=$(ls /usr/lib/jvm/ | grep java-1.8.0-openjdk | grep x86_64) \
    && echo 'networkaddress.cache.ttl=0' >> /usr/lib/jvm/${JRE_DIR}/jre/lib/security/java.security \
    && mkdir /localdaemon
COPY ./zk-Keeper/zk-Keeper /localdaemon

CMD /bin/bash
