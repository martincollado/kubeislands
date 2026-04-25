# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS builder
WORKDIR /build
ENV CGO_ENABLED=0
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG TARGETOS TARGETARCH
ARG VERSION=dev
ARG COMMIT=unknown
RUN --mount=type=cache,target=/root/.cache/go-build \
    GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath \
    -ldflags="-s -w -X main.version=$VERSION -X main.commit=$COMMIT" \
    -o kube-engine ./cmd/kube-engine

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /build/kube-engine /kube-engine
EXPOSE 8081
USER nonroot:nonroot
ENTRYPOINT ["/kube-engine"]
